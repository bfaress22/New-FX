import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StrategyComponent } from '../pages/Index';
import { Plus } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";

interface ZeroCostStrategiesProps {
  spotPrice: number;
  addStrategyToSimulator: (strategy: StrategyComponent[], name: string, options?: { [key: string]: any }) => void;
  onSelect?: (strategy: string) => void;
  monthsToHedge?: number; // Number of months to hedge, for optimization
}

// Black-Scholes formula for option pricing (simplified for use in this component)
const calculateOptionPrice = (
  type: 'call' | 'put',
  S: number,       // Spot price
  K: number,       // Strike price
  r: number,       // Risk-free rate (as decimal, e.g., 0.05 for 5%)
  t: number,       // Time to maturity in years
  sigma: number,   // Volatility (as decimal, e.g., 0.2 for 20%)
): number => {
  // Adjust the strike based on percentage if needed
  const strike = K;
  
  // Calculate d1 and d2
  const d1 = (Math.log(S / strike) + (r + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
  const d2 = d1 - sigma * Math.sqrt(t);
  
  // Standard normal CDF function
  const N = (x: number): number => {
    // Approximation of the cumulative normal distribution
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    
    let sign = 1;
    if (x < 0) {
      sign = -1;
      x = -x;
    }
    
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x / 2);
    
    return 0.5 * (1 + sign * y);
  };
  
  // Calculate option price based on type
  if (type === 'call') {
    return S * N(d1) - strike * Math.exp(-r * t) * N(d2);
  } else { // put
    return strike * Math.exp(-r * t) * N(-d2) - S * N(-d1);
  }
};

// Function to find the strike that balances the premiums for a zero-cost strategy
const findEquilibriumStrike = (
  type: 'call' | 'put',
  oppositeType: 'call' | 'put',
  oppositeStrike: number,
  spotPrice: number,
  volatility: number,
  minStrike: number = 50,
  maxStrike: number = 150,
  tolerance: number = 0.001
): number => {
  // Convert percentages to decimals
  const vol = volatility / 100;
  const r = 0.05; // Assuming 5% risk-free rate
  const t = 1; // Assuming 1 year to expiration
  
  // Calculate the price of the opposite option (fixed)
  const oppositeStrikeValue = oppositeStrike / 100 * spotPrice;
  const oppositePrice = calculateOptionPrice(oppositeType, spotPrice, oppositeStrikeValue, r, t, vol);
  
  // Bisection method to find the strike that matches the price
  let low = minStrike / 100 * spotPrice;
  let high = maxStrike / 100 * spotPrice;
  let mid = 0;
  
  while (high - low > tolerance) {
    mid = (high + low) / 2;
    const currentPrice = calculateOptionPrice(type, spotPrice, mid, r, t, vol);
    
    if (Math.abs(currentPrice - oppositePrice) < tolerance) {
      // Found a sufficiently close match
      break;
    } else if (currentPrice > oppositePrice) {
      // The current strike gives a higher premium - adjust based on option type
      if (type === 'call') {
        low = mid;
      } else {
        high = mid;
      }
    } else {
      // The current strike gives a lower premium - adjust based on option type
      if (type === 'call') {
        high = mid;
      } else {
        low = mid;
      }
    }
  }
  
  // Convert back to percentage of spot
  return (mid / spotPrice) * 100;
};

const ZeroCostStrategies: React.FC<ZeroCostStrategiesProps> = ({ 
  spotPrice, 
  addStrategyToSimulator,
  onSelect,
  monthsToHedge = 12 // Default to 12 months if not provided
}) => {
  const [selectedStrategy, setSelectedStrategy] = useState<string>('collar-put');
  const [customStrategy, setCustomStrategy] = useState<StrategyComponent[]>([]);
  const [customParams, setCustomParams] = useState({
    callStrike: 105,
    putStrike: 95,
    callQuantity: 100,
    putQuantity: 100,
    volatility: 20,
    barrierLevel: 110,
  });
  // Add state for per-period optimization
  const [optimizePerPeriod, setOptimizePerPeriod] = useState(false);
  
  // Effect to auto-adjust strikes to maintain zero-cost when other parameters change
  useEffect(() => {
    if (selectedStrategy === 'collar-put') {
      // When put strike is fixed, calculate the call strike
      const newCallStrike = findEquilibriumStrike(
        'call',
        'put',
        customParams.putStrike,
        spotPrice,
        customParams.volatility
      );
      
      if (Math.abs(newCallStrike - customParams.callStrike) > 0.1) {
        setCustomParams(prev => ({
          ...prev,
          callStrike: parseFloat(newCallStrike.toFixed(1))
        }));
      }
    } else if (selectedStrategy === 'collar-call') {
      // When call strike is fixed, calculate the put strike
      const newPutStrike = findEquilibriumStrike(
        'put',
        'call',
        customParams.callStrike,
        spotPrice,
        customParams.volatility
      );
      
      if (Math.abs(newPutStrike - customParams.putStrike) > 0.1) {
        setCustomParams(prev => ({
          ...prev,
          putStrike: parseFloat(newPutStrike.toFixed(1))
        }));
      }
    }
    // Only run this effect when strategy or volatility changes
  }, [selectedStrategy, customParams.volatility, spotPrice]);

  /**
   * Generates a Zero-Cost Collar strategy with fixed put.
   * The call strike price is calculated so that the premium received from the call exactly offsets the premium paid for the put.
   * This type of structure is used when a company wants to protect against a currency depreciation but is
   * willing to give up potential profit beyond a certain level.
   */
  const generateZeroCostCollarPutFixed = () => {
    if (!optimizePerPeriod) {
      // Original implementation for global strike
      const callStrike = findEquilibriumStrike(
        'call',
        'put',
        customParams.putStrike,
        spotPrice,
        customParams.volatility
      );
      
      const putStrategy: StrategyComponent = {
        type: 'put',
        strike: customParams.putStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: customParams.putQuantity,
      };
      
      const callStrategy: StrategyComponent = {
        type: 'call',
        strike: callStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: -customParams.callQuantity, // Negative because it's a sale
      };
      
      return [putStrategy, callStrategy];
    } else {
      // Special case for per-period optimization
      // Here we create a marker component that will be processed specially by the simulator
      const putStrategy: StrategyComponent = {
        type: 'put',
        strike: customParams.putStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: customParams.putQuantity,
      };
      
      const callStrategy: StrategyComponent = {
        type: 'call',
        strike: 0, // Placeholder, will be calculated per period
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: -customParams.callQuantity, // Negative because it's a sale
        // Add special marker for dynamic calculation
        dynamicStrike: {
          method: 'equilibrium',
          balanceWith: 'put',
          balanceWithIndex: 0, // Index of the put option in the array
        }
      };
      
      return [putStrategy, callStrategy];
    }
  };
  
  /**
   * Generates a Zero-Cost Collar strategy with fixed call.
   * The put strike price is calculated so that the premium paid for the put is exactly offset by the premium received from the call.
   * This structure is used when a company has a maximum price at which it agrees to buy foreign currency.
   */
  const generateZeroCostCollarCallFixed = () => {
    if (!optimizePerPeriod) {
      // Original implementation for global strike
      const putStrike = findEquilibriumStrike(
        'put',
        'call',
        customParams.callStrike,
        spotPrice,
        customParams.volatility
      );
      
      const callStrategy: StrategyComponent = {
        type: 'call',
        strike: customParams.callStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: -customParams.callQuantity, // Negative because it's a sale
      };
      
      const putStrategy: StrategyComponent = {
        type: 'put',
        strike: putStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: customParams.putQuantity,
      };
      
      return [callStrategy, putStrategy];
    } else {
      // Special case for per-period optimization
      const callStrategy: StrategyComponent = {
        type: 'call',
        strike: customParams.callStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: -customParams.callQuantity, // Negative because it's a sale
      };
      
      const putStrategy: StrategyComponent = {
        type: 'put',
        strike: 0, // Placeholder, will be calculated per period
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: customParams.putQuantity,
        // Add special marker for dynamic calculation
        dynamicStrike: {
          method: 'equilibrium',
          balanceWith: 'call',
          balanceWithIndex: 0, // Index of the call option in the array
        }
      };
      
      return [callStrategy, putStrategy];
    }
  };
  
  /**
   * Generates a Zero-Cost Seagull strategy.
   * This strategy combines buying a put, selling a call, and selling a put at a lower strike.
   * It provides protection against moderate downside with zero cost.
   */
  const generateZeroCostSeagull = () => {
    // For this strategy, we need to find two strikes that balance with the long put
    // This is a simplification - in practice, would need more complex optimization
    
    // First calculate a balanced call
    const callStrike = findEquilibriumStrike(
      'call',
      'put',
      customParams.putStrike,
      spotPrice,
      customParams.volatility
    );
    
    // For the short put, use a lower strike 
    const shortPutStrike = customParams.putStrike - 10;
    
    const longPut: StrategyComponent = {
      type: 'put',
      strike: customParams.putStrike,
      strikeType: 'percent',
      volatility: customParams.volatility,
      quantity: customParams.putQuantity,
    };
    
    const shortCall: StrategyComponent = {
      type: 'call',
      strike: callStrike,
      strikeType: 'percent',
      volatility: customParams.volatility,
      quantity: -customParams.callQuantity * 0.7, // Adjusted for zero-cost
    };
    
    const shortPut: StrategyComponent = {
      type: 'put',
      strike: shortPutStrike,
      strikeType: 'percent',
      volatility: customParams.volatility,
      quantity: -customParams.putQuantity * 0.3, // Adjusted to balance the premium
    };
    
    return [longPut, shortCall, shortPut];
  };
  
  /**
   * Generates a Zero-Cost Risk Reversal strategy.
   * Combination of buying a put and selling a call, with strikes determined to neutralize the premium.
   */
  const generateZeroCostRiskReversal = () => {
    if (!optimizePerPeriod) {
      // Original implementation for global strike
      const callStrike = findEquilibriumStrike(
        'call',
        'put',
        customParams.putStrike,
        spotPrice,
        customParams.volatility
      );
      
      const longPut: StrategyComponent = {
        type: 'put',
        strike: customParams.putStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: customParams.putQuantity,
      };
      
      const shortCall: StrategyComponent = {
        type: 'call',
        strike: callStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: -customParams.callQuantity, // Negative because it's a sale
      };
      
      return [longPut, shortCall];
    } else {
      // Special case for per-period optimization
      const longPut: StrategyComponent = {
        type: 'put',
        strike: customParams.putStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: customParams.putQuantity,
      };
      
      const shortCall: StrategyComponent = {
        type: 'call',
        strike: 0, // Placeholder, will be calculated per period
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: -customParams.callQuantity, // Negative because it's a sale
        // Add special marker for dynamic calculation
        dynamicStrike: {
          method: 'equilibrium',
          balanceWith: 'put',
          balanceWithIndex: 0, // Index of the put option in the array
        }
      };
      
      return [longPut, shortCall];
    }
  };
  
  /**
   * Generates a Zero-Cost Participating Forward strategy.
   * Combines a forward for part of the exposure and leaves the rest uncovered to benefit from favorable movements.
   */
  const generateZeroCostParticipatingForward = () => {
    // 50% in forward and 50% uncovered in this example
    const forwardStrategy: StrategyComponent = {
      type: 'forward',
      strike: spotPrice,
      strikeType: 'absolute',
      volatility: 0,
      quantity: 50, // 50% coverage
    };
    
    return [forwardStrategy];
  };
  
  /**
   * Generates a Zero-Cost Knock-Out Forward strategy.
   * Combines buying a put and selling a call, but with a barrier that deactivates the strategy
   * if the exchange rate reaches a certain level, thus reducing the initial cost.
   */
  const generateZeroCostKnockOutForward = () => {
    if (!optimizePerPeriod) {
      // Original implementation
      const callStrike = findEquilibriumStrike(
        'call',
        'put',
        customParams.putStrike,
        spotPrice,
        customParams.volatility * 0.8 // Adjust for barrier effect
      );
      
      const knockoutPut: StrategyComponent = {
        type: 'put-knockout',
        strike: customParams.putStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: customParams.putQuantity,
        barrier: customParams.barrierLevel,
        barrierType: 'percent'
      };
      
      const shortCall: StrategyComponent = {
        type: 'call',
        strike: callStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: -customParams.callQuantity, // Negative because it's a sale
      };
      
      return [knockoutPut, shortCall];
    } else {
      // Special case for per-period optimization
      const knockoutPut: StrategyComponent = {
        type: 'put-knockout',
        strike: customParams.putStrike,
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: customParams.putQuantity,
        barrier: customParams.barrierLevel,
        barrierType: 'percent'
      };
      
      const shortCall: StrategyComponent = {
        type: 'call',
        strike: 0, // Placeholder, will be calculated per period
        strikeType: 'percent',
        volatility: customParams.volatility,
        quantity: -customParams.callQuantity, // Negative because it's a sale
        // Add special marker for dynamic calculation
        dynamicStrike: {
          method: 'equilibrium',
          balanceWith: 'put-knockout',
          balanceWithIndex: 0, // Index of the put option in the array
          volatilityAdjustment: 0.8 // Adjust for barrier effect
        }
      };
      
      return [knockoutPut, shortCall];
    }
  };
  
  /**
   * Generates a Zero-Cost Call Spread strategy for import hedging.
   * Buying a call and selling a call at a higher strike.
   */
  const generateZeroCostCallSpread = () => {
    const longCall: StrategyComponent = {
      type: 'call',
      strike: customParams.putStrike, // Using put parameter for lower strike
      strikeType: 'percent',
      volatility: customParams.volatility,
      quantity: customParams.callQuantity,
    };
    
    // Calculate appropriate short call quantity to balance premium
    const shortCallQuantity = -customParams.callQuantity * 
      (calculateOptionPrice('call', spotPrice, spotPrice * customParams.putStrike / 100, 0.05, 1, customParams.volatility / 100) /
       calculateOptionPrice('call', spotPrice, spotPrice * customParams.callStrike / 100, 0.05, 1, customParams.volatility / 100));
    
    const shortCall: StrategyComponent = {
      type: 'call',
      strike: customParams.callStrike,
      strikeType: 'percent',
      volatility: customParams.volatility,
      quantity: shortCallQuantity, // Adjusted to balance premium
    };
    
    return [longCall, shortCall];
  };
  
  /**
   * Generates a Zero-Cost Put Spread strategy for export hedging.
   * Buying a put and selling a put at a lower strike.
   */
  const generateZeroCostPutSpread = () => {
    const longPut: StrategyComponent = {
      type: 'put',
      strike: customParams.callStrike, // Using call parameter for higher strike
      strikeType: 'percent',
      volatility: customParams.volatility,
      quantity: customParams.putQuantity,
    };
    
    // Calculate appropriate short put quantity to balance premium
    const shortPutQuantity = -customParams.putQuantity * 
      (calculateOptionPrice('put', spotPrice, spotPrice * customParams.callStrike / 100, 0.05, 1, customParams.volatility / 100) /
       calculateOptionPrice('put', spotPrice, spotPrice * customParams.putStrike / 100, 0.05, 1, customParams.volatility / 100));
    
    const shortPut: StrategyComponent = {
      type: 'put',
      strike: customParams.putStrike,
      strikeType: 'percent',
      volatility: customParams.volatility,
      quantity: shortPutQuantity, // Adjusted to balance premium
    };
    
    return [longPut, shortPut];
  };
  
  // Generates the selected strategy
  const generateStrategy = () => {
    let strategy: StrategyComponent[] = [];
    let name = "";
    
    switch (selectedStrategy) {
      case 'collar-put':
        strategy = generateZeroCostCollarPutFixed();
        name = "Zero-Cost Collar (Put Fixed)";
        break;
      case 'collar-call':
        strategy = generateZeroCostCollarCallFixed();
        name = "Zero-Cost Collar (Call Fixed)";
        break;
      case 'seagull':
        strategy = generateZeroCostSeagull();
        name = "Zero-Cost Seagull";
        break;
      case 'risk-reversal':
        strategy = generateZeroCostRiskReversal();
        name = "Zero-Cost Risk Reversal";
        break;
      case 'participating-forward':
        strategy = generateZeroCostParticipatingForward();
        name = "Zero-Cost Participating Forward";
        break;
      case 'knockout-forward':
        strategy = generateZeroCostKnockOutForward();
        name = "Zero-Cost Knock-Out Forward";
        break;
      case 'call-spread':
        strategy = generateZeroCostCallSpread();
        name = "Zero-Cost Call Spread";
        break;
      case 'put-spread':
        strategy = generateZeroCostPutSpread();
        name = "Zero-Cost Put Spread";
        break;
    }
    
    // Add per-period flag to the name if that option is selected
    if (optimizePerPeriod) {
      name += " (Period-Optimized)";
    }
    
    setCustomStrategy(strategy);
    
    // Pass additional options to the simulator
    const options = optimizePerPeriod ? { 
      dynamicStrikeCalculation: true,
      calculateOptionPriceFunction: calculateOptionPrice,
      findEquilibriumStrikeFunction: findEquilibriumStrike
    } : undefined;
    
    addStrategyToSimulator(strategy, name, options);
    
    if (onSelect) {
      onSelect(selectedStrategy);
    }
  };

  // Update parameters and enforce zero-cost through dynamic recalculation
  const handleParamChange = (param: string, value: number) => {
    setCustomParams(prev => {
      const newParams = {
        ...prev,
        [param]: value
      };
      
      // No need to recalculate here as the useEffect will handle it
      return newParams;
    });
  };
  
  // Display calculated prices to help user understand strategy costs
  const getPremiumEstimate = (strategyType: string): { longPrice: number, shortPrice: number, netPremium: number } => {
    let longPrice = 0;
    let shortPrice = 0;
    
    // Convert parameters for pricing
    const r = 0.05; // Risk-free rate as decimal
    const t = 1;    // 1 year to expiration
    const vol = customParams.volatility / 100;
    
    if (strategyType === 'collar-put') {
      // Long put
      longPrice = calculateOptionPrice(
        'put',
        spotPrice,
        spotPrice * customParams.putStrike / 100,
        r, t, vol
      );
      
      // Short call with dynamically calculated strike
      const callStrike = customParams.callStrike;
      shortPrice = calculateOptionPrice(
        'call',
        spotPrice,
        spotPrice * callStrike / 100,
        r, t, vol
      );
    } 
    else if (strategyType === 'collar-call') {
      // Short call
      shortPrice = calculateOptionPrice(
        'call',
        spotPrice,
        spotPrice * customParams.callStrike / 100,
        r, t, vol
      );
      
      // Long put with dynamically calculated strike
      const putStrike = customParams.putStrike;
      longPrice = calculateOptionPrice(
        'put',
        spotPrice,
        spotPrice * putStrike / 100,
        r, t, vol
      );
    }
    // Other strategy types would have similar calculations
    
    return {
      longPrice,
      shortPrice,
      netPremium: longPrice - shortPrice
    };
  };
  
  return (
    <Card className="shadow-md w-full">
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-xl font-bold text-primary">Zero-Cost Strategies</CardTitle>
        <CardDescription>
          Select a zero-cost hedging strategy for foreign exchange risk
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="strategy-select">Strategy Type</Label>
            <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="collar-put">Zero-Cost Collar (Put Fixed)</SelectItem>
                <SelectItem value="collar-call">Zero-Cost Collar (Call Fixed)</SelectItem>
                <SelectItem value="risk-reversal">Risk Reversal</SelectItem>
                <SelectItem value="seagull">Seagull</SelectItem>
                <SelectItem value="participating-forward">Participating Forward</SelectItem>
                <SelectItem value="knockout-forward">Knock-Out Forward</SelectItem>
                <SelectItem value="call-spread">Call Spread</SelectItem>
                <SelectItem value="put-spread">Put Spread</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <Accordion type="single" collapsible defaultValue="parameters">
            <AccordionItem value="parameters">
              <AccordionTrigger>Strategy Parameters</AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div>
                    <Label htmlFor="call-strike">
                      {selectedStrategy === 'collar-put' ? "Call Strike (auto-balanced) (%)" : "Call Strike (%)"}
                    </Label>
                    <Input
                      id="call-strike"
                      type="number"
                      value={customParams.callStrike}
                      onChange={(e) => handleParamChange('callStrike', Number(e.target.value))}
                      disabled={selectedStrategy === 'collar-put'} // Disable when auto-calculated
                    />
                  </div>
                  <div>
                    <Label htmlFor="put-strike">
                      {selectedStrategy === 'collar-call' ? "Put Strike (auto-balanced) (%)" : "Put Strike (%)"}
                    </Label>
                    <Input
                      id="put-strike"
                      type="number"
                      value={customParams.putStrike}
                      onChange={(e) => handleParamChange('putStrike', Number(e.target.value))}
                      disabled={selectedStrategy === 'collar-call'} // Disable when auto-calculated
                    />
                  </div>
                  <div>
                    <Label htmlFor="volatility">Volatility (%)</Label>
                    <Input
                      id="volatility"
                      type="number"
                      value={customParams.volatility}
                      onChange={(e) => handleParamChange('volatility', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="barrierLevel">Barrier Level (%)</Label>
                    <Input
                      id="barrierLevel"
                      type="number"
                      value={customParams.barrierLevel}
                      onChange={(e) => handleParamChange('barrierLevel', Number(e.target.value))}
                    />
                  </div>
                </div>
                
                {/* Add option for per-period optimization */}
                <div className="mt-4 flex items-center space-x-2">
                  <Switch
                    id="optimize-periods"
                    checked={optimizePerPeriod}
                    onCheckedChange={setOptimizePerPeriod}
                  />
                  <Label htmlFor="optimize-periods" className="cursor-pointer">
                    Optimize strikes for each period separately
                  </Label>
                </div>
                
                {/* Display info message about per-period optimization */}
                {optimizePerPeriod && (
                  <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-md text-sm">
                    <p>When enabled, strikes are calculated separately for each period based on its time to maturity, ensuring a zero-cost strategy in every period.</p>
                  </div>
                )}
                
                {/* Display premium estimates */}
                {(selectedStrategy === 'collar-put' || selectedStrategy === 'collar-call') && !optimizePerPeriod && (
                  <div className="mt-4 p-3 bg-muted/30 rounded-md">
                    <h4 className="text-sm font-medium mb-2">Premium Calculation</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>Long Premium: 
                        <span className="ml-1 font-mono">
                          {getPremiumEstimate(selectedStrategy).longPrice.toFixed(4)}
                        </span>
                      </div>
                      <div>Short Premium: 
                        <span className="ml-1 font-mono">
                          {getPremiumEstimate(selectedStrategy).shortPrice.toFixed(4)}
                        </span>
                      </div>
                      <div className="col-span-2">
                        Net Premium: 
                        <span className={`ml-1 font-mono ${Math.abs(getPremiumEstimate(selectedStrategy).netPremium) < 0.001 ? 'text-green-500' : 'text-red-500'}`}>
                          {getPremiumEstimate(selectedStrategy).netPremium.toFixed(4)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
            
            <AccordionItem value="description">
              <AccordionTrigger>Strategy Description</AccordionTrigger>
              <AccordionContent>
                <Tabs defaultValue={selectedStrategy} value={selectedStrategy} className="w-full">
                  <TabsContent value="collar-put">
                    <p className="text-sm text-gray-600">
                      The <strong>Zero-Cost Collar (Put Fixed)</strong> is a strategy where the company buys a put option at a fixed strike and simultaneously
                      sells a call option at a strike calculated to offset the premiums. This strategy protects against downside up to the
                      put strike and allows upside benefit up to the call strike.
                    </p>
                  </TabsContent>
                  <TabsContent value="collar-call">
                    <p className="text-sm text-gray-600">
                      The <strong>Zero-Cost Collar (Call Fixed)</strong> is similar to the previous one, but with the call strike fixed and the put strike
                      calculated to offset the premiums. Used when a company has a maximum price at which it is willing to convert its currency.
                    </p>
                  </TabsContent>
                  <TabsContent value="risk-reversal">
                    <p className="text-sm text-gray-600">
                      The <strong>Risk Reversal</strong> is a strategy where the company buys a put option and simultaneously sells a call option at strikes
                      chosen to offset the premiums. Very similar to a collar but often used with strikes further away from the spot price.
                    </p>
                  </TabsContent>
                  <TabsContent value="seagull">
                    <p className="text-sm text-gray-600">
                      The <strong>Seagull</strong> is a three-legged strategy that combines buying a put (protection), selling a call (cap) and
                      selling a put at a lower strike. This structure provides an improved protection level compared to a simple collar.
                    </p>
                  </TabsContent>
                  <TabsContent value="participating-forward">
                    <p className="text-sm text-gray-600">
                      The <strong>Participating Forward</strong> combines a forward contract for part of the exposure (e.g., 50%) and leaves the rest uncovered.
                      This allows partial benefit from favorable movements while having guaranteed partial coverage.
                    </p>
                  </TabsContent>
                  <TabsContent value="knockout-forward">
                    <p className="text-sm text-gray-600">
                      The <strong>Knock-Out Forward</strong> uses barrier options that cancel if the rate reaches a certain level (the barrier).
                      This feature allows for better protection or a better guaranteed rate, but with the risk that the coverage may disappear.
                    </p>
                  </TabsContent>
                  <TabsContent value="call-spread">
                    <p className="text-sm text-gray-600">
                      The <strong>Call Spread</strong> involves buying a call at one strike price and selling a call at a higher strike price.
                      This strategy is useful for importers who want to protect against appreciation of a foreign currency.
                    </p>
                  </TabsContent>
                  <TabsContent value="put-spread">
                    <p className="text-sm text-gray-600">
                      The <strong>Put Spread</strong> involves buying a put at one strike price and selling a put at a lower strike price.
                      This strategy is useful for exporters who want to protect against depreciation of a foreign currency.
                    </p>
                  </TabsContent>
                </Tabs>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          
          <Button onClick={generateStrategy} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add this strategy to simulator
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ZeroCostStrategies; 