import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Plus, Trash2, Save } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from 'react-router-dom';
import { CalculatorState } from '../types/CalculatorState';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface StressTestScenario {
  name: string;
  description: string;
  volatility: number;
  drift: number;
  priceShock: number;
  forwardBasis?: number;
  realBasis?: number;
  isCustom?: boolean;
  isEditable?: boolean;
}

interface StrategyComponent {
  type: 'call' | 'put' | 'swap';
  strike: number;
  strikeType: 'percent' | 'absolute';
  volatility: number;
  quantity: number;
}

interface Result {
  date: string;
  timeToMaturity: number;
  forward: number;
  realPrice: number;
  optionPrices: Array<{
    type: string;
    price: number;
    quantity: number;
    strike: number;
    label: string;
  }>;
  strategyPrice: number;
  totalPayoff: number;
  monthlyVolume: number;
  hedgedCost: number;
  unhedgedCost: number;
  deltaPnL: number;
}

interface SavedScenario {
  id: string;
  name: string;
  timestamp: number;
  params: {
    startDate: string;
    monthsToHedge: number;
    interestRate: number;
    totalVolume: number;
    spotPrice: number;
  };
  strategy: StrategyComponent[];
  results: Result[];
  payoffData: Array<{ price: number; payoff: number }>;
  stressTest?: StressTestScenario;
}

interface ImpliedVolatility {
  [key: string]: number; // Format: "YYYY-MM": volatility
}

interface HistoricalDataPoint {
  date: string;
  price: number;
}

interface MonthlyStats {
  month: string;
  avgPrice: number;
  volatility: number;
}

const DEFAULT_SCENARIOS = {
  base: {
    name: "Base Case",
    description: "Normal market conditions",
    volatility: 0.2,
    drift: 0.01,
    priceShock: 0,
    forwardBasis: 0,
    isEditable: true
  },
  highVol: {
    name: "High Volatility",
    description: "Double volatility scenario",
    volatility: 0.4,
    drift: 0.01,
    priceShock: 0,
    forwardBasis: 0,
    isEditable: true
  },
  crash: {
    name: "Market Crash",
    description: "High volatility, negative drift, price shock",
    volatility: 0.5,
    drift: -0.03,
    priceShock: -0.2,
    forwardBasis: 0,
    isEditable: true
  },
  bull: {
    name: "Bull Market",
    description: "Low volatility, positive drift, upward shock",
    volatility: 0.15,
    drift: 0.02,
    priceShock: 0.1,
    forwardBasis: 0,
    isEditable: true
  }
};

const Index = () => {
  // Add state for active tab
  const [activeTab, setActiveTab] = useState(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).activeTab : 'parameters';
  });

  // Basic parameters state
  const [params, setParams] = useState(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).params : {
      startDate: new Date().toISOString().split('T')[0],
      monthsToHedge: 12,
      interestRate: 2.0,
      totalVolume: 1000000,
      spotPrice: 100
    };
  });

  // Keep track of initial spot price
  const [initialSpotPrice, setInitialSpotPrice] = useState<number>(params.spotPrice);

  // Strategy components state
  const [strategy, setStrategy] = useState(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).strategy : [];
  });

  // Results state
  const [results, setResults] = useState(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).results : null;
  });

  // Manual forward prices state
  const [manualForwards, setManualForwards] = useState(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).manualForwards : {};
  });

  // Real prices state
  const [realPrices, setRealPrices] = useState(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).realPrices : {};
  });

  // Payoff data state
  const [payoffData, setPayoffData] = useState(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).payoffData : [];
  });

  // Real prices simulation parameters
  const [realPriceParams, setRealPriceParams] = useState(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).realPriceParams : {
      useSimulation: false,
      volatility: 0.3,
      drift: 0.01,
      numSimulations: 1000
    };
  });

  // Month names in English
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  // Custom scenario state
  const [customScenario, setCustomScenario] = useState<StressTestScenario>(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).customScenario : {
      name: "Custom Case",
      description: "User-defined scenario",
      volatility: 0.2,
      drift: 0.01,
      priceShock: 0,
      forwardBasis: 0,
      isCustom: true
    };
  });

  // Stress Test Scenarios
  const [stressTestScenarios, setStressTestScenarios] = useState<Record<string, StressTestScenario>>(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).stressTestScenarios : DEFAULT_SCENARIOS;
  });

  // Add state for active stress test
  const [activeStressTest, setActiveStressTest] = useState<string | null>(null);

  // Add state for showing inputs
  const [showInputs, setShowInputs] = useState<Record<string, boolean>>({});

  // Toggle inputs visibility for a scenario
  const toggleInputs = (key: string) => {
    setShowInputs(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Add these new states
  const [useImpliedVol, setUseImpliedVol] = useState(false);
  const [impliedVolatilities, setImpliedVolatilities] = useState<ImpliedVolatility>({});

  // Historical data state
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);

  // Ajoutez ces états
  const [showHistoricalData, setShowHistoricalData] = useState(true);
  const [showMonthlyStats, setShowMonthlyStats] = useState(true);

  // Calculate Black-Scholes Option Price
  const calculateOptionPrice = (type, S, K, r, t, sigma, date?) => {
    // Utilisez la volatilité implicite si disponible
    let effectiveSigma = sigma;
    if (date && useImpliedVol) {
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      if (impliedVolatilities[monthKey]) {
        effectiveSigma = impliedVolatilities[monthKey] / 100;
      }
    }

    const d1 = (Math.log(S/K) + (r + effectiveSigma**2/2)*t) / (effectiveSigma*Math.sqrt(t));
    const d2 = d1 - effectiveSigma*Math.sqrt(t);
    
    const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
    const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
    
    if (type === 'call') {
      return S*Nd1 - K*Math.exp(-r*t)*Nd2;
    } else {
      return K*Math.exp(-r*t)*(1-Nd2) - S*(1-Nd1);
    }
  };

  // Error function (erf) implementation
  const erf = (x) => {
    const a1 =  0.254829592;
    const a2 = -0.284496736;
    const a3 =  1.421413741;
    const a4 = -1.453152027;
    const a5 =  1.061405429;
    const p  =  0.3275911;
    
    const sign = (x < 0) ? -1 : 1;
    x = Math.abs(x);
    
    const t = 1.0/(1.0 + p*x);
    const y = 1.0 - ((((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x));
    
    return sign*y;
  };

  // Calculate real prices using Monte Carlo simulation
  const simulateRealPrices = (months, startDate) => {
    const dt = 1/12; // Monthly time step
    let currentPrice = params.spotPrice;
    const prices = {};
    
    // Box-Muller transform for better normal distribution approximation
    const generateNormal = () => {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    };
    
    months.forEach((date) => {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // Generate random walk with better normal distribution
      const randomWalk = generateNormal();
      
      // Apply geometric Brownian motion formula
      currentPrice = currentPrice * Math.exp(
        (realPriceParams.drift - Math.pow(realPriceParams.volatility, 2) / 2) * dt + 
        realPriceParams.volatility * Math.sqrt(dt) * randomWalk
      );
      
      prices[monthKey] = currentPrice;
    });
    
    return prices;
  };

  // Calculate Payoff at Maturity
  const calculatePayoff = () => {
    if (strategy.length === 0) return;

    const spotPrice = params.spotPrice;
    const priceRange = Array.from({length: 101}, (_, i) => spotPrice * (0.5 + i * 0.01));

    const payoffCalculation = priceRange.map(price => {
      let totalPayoff = 0;

      strategy.forEach(option => {
        const strike = option.strikeType === 'percent' 
          ? params.spotPrice * (option.strike / 100) 
          : option.strike;

        const quantity = option.quantity / 100;

        // Calculate option premium using Black-Scholes
        const optionPremium = calculateOptionPrice(
          option.type,
          spotPrice,
          strike,
          params.interestRate/100,
          1, // 1 year to maturity for payoff diagram
          option.volatility/100,
          new Date() // Ajoutez la date courante
        );

        if (option.type === 'call') {
          totalPayoff += (Math.max(price - strike, 0) - optionPremium) * quantity;
        } else {
          totalPayoff += (Math.max(strike - price, 0) - optionPremium) * quantity;
        }
      });

      return {
        price,
        payoff: totalPayoff
      };
    });

    setPayoffData(payoffCalculation);
  };

  // Add new option to strategy
  const addOption = () => {
    setStrategy([...strategy, {
      type: 'call',
      strike: 100,
      strikeType: 'percent',
      volatility: 20,
      quantity: 100
    }]);
  };

  // Remove option from strategy
  const removeOption = (index) => {
    const newStrategy = strategy.filter((_, i) => i !== index);
    setStrategy(newStrategy);
    
    if (newStrategy.length > 0) {
      calculatePayoff();
    } else {
      setPayoffData([]);
    }
  };

  // Update option parameters
  const updateOption = (index, field, value) => {
    const newStrategy = [...strategy];
    newStrategy[index][field] = value;
    setStrategy(newStrategy);
    calculatePayoff();
  };

  // Calculate detailed results
  const calculateResults = () => {
    const startDate = new Date(params.startDate);
    const months = Array.from({ length: params.monthsToHedge }, (_, i) => {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + i + 1, 0);
      return date;
    });

    // Generate new price paths with Monte Carlo ONLY if simulation is enabled
    // AND no stress test scenario is active
    if (realPriceParams.useSimulation && !activeStressTest) {
      // Generate new simulated prices
      const simulatedPrices = simulateRealPrices(months, startDate);
      setRealPrices(simulatedPrices);
    }

    const timeToMaturities = months.map(date => {
      const diffTime = Math.abs(date.getTime() - startDate.getTime());
      return diffTime / (365.25 * 24 * 60 * 60 * 1000);
    });

    const monthlyVolume = params.totalVolume / params.monthsToHedge;

    const detailedResults = months.map((date, i) => {
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      // Find the corresponding monthly statistics
      const monthStats = monthlyStats.find(stat => stat.month === monthKey);
      
      // Calculate forward price
      const forward = manualForwards[monthKey] || 
        params.spotPrice * Math.exp(params.interestRate / 100 * timeToMaturities[i]);

      // Use real price from simulation or manual input
      const realPrice = activeStressTest && scenario.realBasis === undefined ? 
        realPrices[monthKey] || (monthStats?.avgPrice || forward) : 
        realPrices[monthKey] || forward;
      const impliedVolatility = monthStats ? monthStats.volatility * 100 : null;

      // Calculate swap price once for all swaps
      const swapPrice = calculateSwapPrice(
        months.map((_, idx) => {
          const monthKey = `${_.getFullYear()}-${_.getMonth() + 1}`;
          return manualForwards[monthKey] || 
            initialSpotPrice * Math.exp(params.interestRate / 100 * timeToMaturities[idx]);
        }),
        timeToMaturities,
        params.interestRate / 100
      );

      // Separate swaps from options
      const swaps = strategy.filter(s => s.type === 'swap');
      const options = strategy.filter(s => s.type !== 'swap');

      // Calculate option prices as before
      const optionPrices = options.map((option, optIndex) => {
        const strike = option.strikeType === 'percent' ? 
          params.spotPrice * (option.strike / 100) : 
          option.strike;
        
        return {
          type: option.type,
          price: calculateOptionPrice(
            option.type,
            forward,
            strike,
            params.interestRate / 100,
            timeToMaturities[i],
            option.volatility / 100,
            date
          ),
          quantity: option.quantity / 100,
          strike: strike,
          label: `${option.type === 'call' ? 'Call' : 'Put'} Price ${optIndex + 1}`
        };
      });

      // Calculate strategy price
      const strategyPrice = optionPrices.reduce((total, opt) => 
        total + (opt.price * opt.quantity), 0);

      // Calculate payoff using real price
      const totalPayoff = optionPrices.reduce((sum, opt) => {
        const payoff = opt.type === 'call' 
          ? Math.max(realPrice - opt.strike, 0)
          : Math.max(opt.strike - realPrice, 0);
        return sum + (payoff * opt.quantity);
      }, 0);

      // Then, use these variables in the calculation of hedgedCost
      const totalSwapPercentage = swaps.reduce((sum, swap) => sum + swap.quantity, 0) / 100;
      const hedgedPrice = totalSwapPercentage * swapPrice + (1 - totalSwapPercentage) * realPrice;

      const hedgedCost = -(monthlyVolume * hedgedPrice) - 
        (monthlyVolume * (1 - totalSwapPercentage) * strategyPrice) + 
        (monthlyVolume * (1 - totalSwapPercentage) * totalPayoff);

      return {
        date: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        timeToMaturity: timeToMaturities[i],
        forward,
        realPrice,
        impliedVolatility,
        optionPrices: [
          ...optionPrices,
          ...swaps.map(swap => ({
            type: 'swap',
            price: swapPrice,
            quantity: swap.quantity / 100,
            strike: swap.strike,
            label: 'Swap Price'
          }))
        ],
        strategyPrice,
        totalPayoff,
        monthlyVolume,
        hedgedCost,
        unhedgedCost: -(monthlyVolume * realPrice),
        deltaPnL: hedgedCost - (-(monthlyVolume * realPrice))
      };
    });

    setResults(detailedResults);
    setUseImpliedVol(monthlyStats.length > 0);
    calculatePayoff();
  };

  useEffect(() => {
    if (strategy.length > 0) {
      calculatePayoff();
    }
  }, [strategy]);

  // Function to apply a stress test scenario
  const applyStressTest = (key: string) => {
    setActiveStressTest(key);
    const scenario = stressTestScenarios[key];
    if (!scenario) return;
    
    // Calculate initial stressed spot price
    const stressedSpotPrice = initialSpotPrice;
    if (isNaN(stressedSpotPrice) || stressedSpotPrice <= 0) {
      console.error('Invalid stressed spot price:', stressedSpotPrice);
      return;
    }

    // Update simulation parameters
    setRealPriceParams(prev => ({
      ...prev,
      useSimulation: false,  // Disable simulation when applying stress test
      volatility: Math.max(0, scenario.volatility),
      drift: scenario.drift
    }));

    // Create a function to get the correct date and key for each month
    const getMonthData = (startDate: Date, monthsAhead: number) => {
      const date = new Date(startDate);
      const yearsToAdd = Math.floor(monthsAhead / 12);
      const monthsToAdd = monthsAhead % 12;
      date.setFullYear(date.getFullYear() + yearsToAdd);
      const newMonth = date.getMonth() + monthsToAdd;
      if (newMonth > 11) {
        date.setFullYear(date.getFullYear() + 1);
        date.setMonth(newMonth - 12);
      } else {
        date.setMonth(newMonth);
      }
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { date, monthKey };
    };

    const startDate = new Date(params.startDate);

    // Store current real prices before updating
    const prevRealPrices = {...realPrices};
    
    // Clear forwards but KEEP real prices
    setManualForwards({});

    // Handle scenarios with monthly price shocks
    if (scenario.priceShock !== 0 && scenario.priceShock !== undefined) {
      const newForwards = {};
      
      // Determine the multiplier based on scenario type
      let rateMultiplier;
      
      if (key === 'contango') {
        rateMultiplier = 1 + scenario.priceShock; // Increase prices
      } else if (key === 'backwardation') {
        rateMultiplier = 1 - scenario.priceShock; // Decrease prices
      } else if (key === 'crash') {
        // Market crash: price shock and decrease each month
        rateMultiplier = 1 - Math.abs(scenario.priceShock) / params.monthsToHedge;
      } else if (key === 'bull') {
        // Bull market: price shock and increase each month
        rateMultiplier = 1 + scenario.priceShock / params.monthsToHedge;
      } else {
        // For other scenarios, apply price shock only to initial price
        rateMultiplier = 1;
      }
      
      // Start with the spot price
      let currentPrice = stressedSpotPrice;
      
      // For first month, apply the full shock for crash or bull scenarios
      if (key === 'crash') {
        currentPrice = stressedSpotPrice * (1 - Math.abs(scenario.priceShock) / 2);
      } else if (key === 'bull') {
        currentPrice = stressedSpotPrice * (1 + scenario.priceShock / 2);
      }
      
      // Calculate forward prices with monthly changes
      for (let i = 0; i < params.monthsToHedge; i++) {
        const { monthKey } = getMonthData(startDate, i);
        
        // Apply interest rate
        const timeInYears = i / 12;
        const interestFactor = Math.exp((params.interestRate/100) * timeInYears);
        
        // Apply monthly change for scenarios other than base case
        if (key !== 'base' && key !== 'highVol' && i > 0) {
          currentPrice = currentPrice * rateMultiplier;
        }
        
        // Apply interest rate to current price
        const forwardPrice = currentPrice * interestFactor;
        
        if (!isNaN(forwardPrice) && forwardPrice > 0) {
          newForwards[monthKey] = forwardPrice;
        }
      }
      setManualForwards(newForwards);
    }
    // Regular handling for other scenarios with forwardBasis
    else if (scenario.forwardBasis !== undefined) {
      const newForwards = {};
      for (let i = 0; i < params.monthsToHedge; i++) {
        const { monthKey } = getMonthData(startDate, i);
        const timeInYears = i / 12;
        
        // Use continuous compounding with interest rate + forward basis
        const forwardPrice = stressedSpotPrice * Math.exp(
          (params.interestRate/100 + Number(scenario.forwardBasis)) * timeInYears
        );
        
        if (!isNaN(forwardPrice) && forwardPrice > 0) {
          newForwards[monthKey] = forwardPrice;
        }
      }
      setManualForwards(newForwards);
    }

    // ONLY update real prices if this is a scenario that directly affects real prices
    if (scenario.realBasis !== undefined) {
      const newRealPrices = {};
      const baseForwards = {};
      
      // First calculate base forwards using just the interest rate
      for (let i = 0; i < params.monthsToHedge; i++) {
        const { monthKey } = getMonthData(startDate, i);
        const timeInYears = i / 12;
        
        const forwardPrice = stressedSpotPrice * Math.exp(
          (params.interestRate/100) * timeInYears
        );
        baseForwards[monthKey] = forwardPrice;
      }

      // Then calculate real prices with real basis
      for (let i = 0; i < params.monthsToHedge; i++) {
        const { monthKey } = getMonthData(startDate, i);
        const timeInYears = i / 12;
        
        const realPrice = stressedSpotPrice * Math.exp(
          Number(scenario.realBasis) * timeInYears * 12
        );
        
        if (!isNaN(realPrice) && realPrice > 0) {
          newRealPrices[monthKey] = realPrice;
          setManualForwards(prev => ({
            ...prev,
            [monthKey]: baseForwards[monthKey]
          }));
        }
      }
      setRealPrices(newRealPrices); // ONLY replace real prices for realBasis scenarios
    }

    // Ensure calculateResults runs with the updated parameters
    setTimeout(() => {
      calculateResults();
    }, 50);
  };

  // Update stress test scenario with validation
  const updateScenario = (key: string, field: keyof StressTestScenario, value: number) => {
    setStressTestScenarios(prev => {
      const updatedScenarios = {
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
      };

      // Validate updated scenario
      const scenario = updatedScenarios[key];
      if (scenario.volatility < 0) scenario.volatility = 0;
      if (Math.abs(scenario.priceShock) > 1) {
        scenario.priceShock = Math.sign(scenario.priceShock);
      }

      return updatedScenarios;
    });
  };

  // Type guard for results
  const isValidResult = (result: any): result is Result => {
    return result && 
      typeof result.hedgedCost === 'number' &&
      typeof result.unhedgedCost === 'number' &&
      typeof result.deltaPnL === 'number';
  };

  // Update the yearlyResults calculation with type checking
  const calculateYearlyResults = (results: Result[]) => {
    return results.reduce((acc: Record<string, { hedgedCost: number; unhedgedCost: number; deltaPnL: number }>, row) => {
      const year = row.date.split(' ')[1];
      if (!acc[year]) {
        acc[year] = {
          hedgedCost: 0,
          unhedgedCost: 0,
          deltaPnL: 0
        };
      }
      if (isValidResult(row)) {
        acc[year].hedgedCost += row.hedgedCost;
        acc[year].unhedgedCost += row.unhedgedCost;
        acc[year].deltaPnL += row.deltaPnL;
      }
      return acc;
    }, {});
  };

  // Modifier le gestionnaire de changement du prix spot
  const handleSpotPriceChange = (newPrice: number) => {
    setParams(prev => ({
      ...prev,
      spotPrice: newPrice
    }));
    setInitialSpotPrice(newPrice); // Mettre à jour le prix spot initial uniquement lors des modifications manuelles
  };

  // Add this useEffect near your other useEffect hooks
  useEffect(() => {
    if (!realPriceParams.useSimulation) {
      // When switching to manual mode, initialize real prices with forward prices
      const initialRealPrices = {};
      results?.forEach(row => {
        const date = new Date(row.date);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        initialRealPrices[monthKey] = row.forward;
      });
      setRealPrices(initialRealPrices);
    }
  }, [realPriceParams.useSimulation]);

  const saveScenario = () => {
    if (!results || !payoffData) return;

    const scenario: SavedScenario = {
      id: crypto.randomUUID(),
      name: `Scenario ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      params,
      strategy,
      results,
      payoffData,
      stressTest: activeStressTest ? stressTestScenarios[activeStressTest] : null
    };

    const savedScenarios = JSON.parse(localStorage.getItem('optionScenarios') || '[]');
    savedScenarios.push(scenario);
    localStorage.setItem('optionScenarios', JSON.stringify(savedScenarios));

    alert('Scenario saved successfully!');
  };

  // Save state when important values change
  useEffect(() => {
    const state: CalculatorState = {
      params,
      strategy,
      results,
      payoffData,
      manualForwards,
      realPrices,
      realPriceParams,
      activeTab,
      customScenario,
      stressTestScenarios
    };
    localStorage.setItem('calculatorState', JSON.stringify(state));
  }, [
    params,
    strategy,
    results,
    payoffData,
    manualForwards,
    realPrices,
    realPriceParams,
    activeTab,
    customScenario,
    stressTestScenarios
  ]);

  const resetScenario = (key: string) => {
    if (DEFAULT_SCENARIOS[key]) {
      setStressTestScenarios(prev => ({
        ...prev,
        [key]: { ...DEFAULT_SCENARIOS[key] }
      }));
    }
  };

  // Add function to clear loaded scenario
  const clearLoadedScenario = () => {
    setParams({
      startDate: new Date().toISOString().split('T')[0],
      monthsToHedge: 12,
      interestRate: 2.0,
      totalVolume: 1000000,
      spotPrice: 100
    });
    setStrategy([]);
    setResults(null);
    setPayoffData([]);
    setManualForwards({});
    setRealPrices({});
    setRealPriceParams({
      useSimulation: false,
      volatility: 0.3,
      drift: 0.01,
      numSimulations: 1000
    });
    
    // Réinitialiser les scénarios de stress test à leurs valeurs par défaut
    setStressTestScenarios({
      base: {
        name: "Base Case",
        description: "Normal market conditions",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0,
        isEditable: true
      },
      highVol: {
        name: "High Volatility",
        description: "Double volatility scenario",
        volatility: 0.4,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0,
        isEditable: true
      },
      crash: {
        name: "Market Crash",
        description: "High volatility, negative drift, price shock",
        volatility: 0.5,
        drift: -0.03,
        priceShock: -0.2,
        forwardBasis: 0,
        isEditable: true
      },
      bull: {
        name: "Bull Market",
        description: "Low volatility, positive drift, upward shock",
        volatility: 0.15,
        drift: 0.02,
        priceShock: 0.1,
        forwardBasis: 0,
        isEditable: true
      },
      contango: {
        name: "Contango",
        description: "Forward prices higher than spot (monthly basis in %)",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0.01,
        isEditable: true
      },
      backwardation: {
        name: "Backwardation",
        description: "Forward prices lower than spot (monthly basis in %)",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: -0.01,
        isEditable: true
      },
      contangoReal: {
        name: "Contango (Real Prices)",
        description: "Real prices higher than spot (monthly basis in %)",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        realBasis: 0.01,
        isEditable: true
      },
      backwardationReal: {
        name: "Backwardation (Real Prices)",
        description: "Real prices lower than spot (monthly basis in %)",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        realBasis: -0.01,
        isEditable: true
      },
      custom: {
        name: "Custom Case",
        description: "User-defined scenario",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0,
        isCustom: true
      }
    });

    // Save the current state but with cleared scenario
    const state: CalculatorState = {
      params: {
        startDate: new Date().toISOString().split('T')[0],
        monthsToHedge: 12,
        interestRate: 2.0,
        totalVolume: 1000000,
        spotPrice: 100
      },
      strategy: [],
      results: null,
      payoffData: [],
      manualForwards: {},
      realPrices: {},
      realPriceParams: {
        useSimulation: false,
        volatility: 0.3,
        drift: 0.01,
        numSimulations: 1000
      },
      activeTab: activeTab,
      customScenario: {
        name: "Custom Case",
        description: "User-defined scenario",
        volatility: 0.2,
        drift: 0.01,
        priceShock: 0,
        forwardBasis: 0,
        isCustom: true
      },
      stressTestScenarios: DEFAULT_SCENARIOS
    };
    localStorage.setItem('calculatorState', JSON.stringify(state));
  };

  // Add this function to prepare content for PDF export
  const prepareForPDF = () => {
    // Ensure tables don't break across pages
    const tables = document.querySelectorAll('table');
    tables.forEach(table => {
      (table as HTMLElement).style.pageBreakInside = 'avoid';
      (table as HTMLElement).style.width = '100%';
    });

    // Add proper page breaks between sections
    const sections = document.querySelectorAll('.Card');
    sections.forEach(section => {
      (section as HTMLElement).style.pageBreakInside = 'avoid';
      (section as HTMLElement).style.marginBottom = '20px';
    });
  };

  // Modify the PDF export function
  const exportToPDF = async () => {
    prepareForPDF();

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      compress: true
    });

    // Create a temporary div for PDF content
    const tempDiv = document.createElement('div');
    tempDiv.className = 'scenario-pdf-content';
    tempDiv.innerHTML = `
      <div class="scenario-header">
        <h2>Scenario ${new Date().toLocaleDateString()}</h2>
        <div class="scenario-info">
          <div class="basic-parameters">
            <p>Type: ${strategy[0]?.type || ''}</p>
            <p>Start Date: ${params.startDate}</p>
            <p>Spot Price: ${params.spotPrice}</p>
            <p>Total Volume: ${params.totalVolume}</p>
          </div>
          <div class="stress-parameters">
            <p>Volatility: ${(stressTestScenarios[activeStressTest || 'base']?.volatility * 100).toFixed(1)}%</p>
            <p>Price Shock: ${(stressTestScenarios[activeStressTest || 'base']?.priceShock * 100).toFixed(1)}%</p>
          </div>
        </div>
      </div>
      <div class="charts-section">
        ${document.querySelector('.pnl-evolution')?.outerHTML || ''}
        ${document.querySelector('.payoff-diagram')?.outerHTML || ''}
      </div>
      <div class="detailed-results">
        ${document.querySelector('.detailed-results table')?.outerHTML || ''}
      </div>
      <div class="summary-statistics">
        ${document.querySelector('.summary-statistics table')?.outerHTML || ''}
      </div>
    `;

    // Add styles for PDF
    const style = document.createElement('style');
    style.textContent = `
      .scenario-pdf-content {
        padding: 20px;
        font-family: Arial, sans-serif;
      }
      .scenario-header {
        margin-bottom: 20px;
      }
      .scenario-info {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        margin-bottom: 30px;
      }
      .charts-section {
        display: grid;
        grid-template-columns: 1fr;
        gap: 20px;
        margin-bottom: 30px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 12px;
      }
      th, td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
      }
    `;
    tempDiv.appendChild(style);

    document.body.appendChild(tempDiv);
    
    try {
      await pdf.html(tempDiv, {
        ...options,
        html2canvas: {
          ...options.html2canvas,
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true,
          allowTaint: true,
          foreignObjectRendering: true,
          svgRendering: true
        }
      });
      pdf.save('strategy-results.pdf');
    } finally {
      document.body.removeChild(tempDiv);
    }
  };

  // Ajoutez cette fonction pour gérer les changements de volatilité implicite
  const handleImpliedVolChange = (monthKey: string, value: number) => {
    setImpliedVolatilities(prev => ({
      ...prev,
      [monthKey]: value
    }));
  };

  // Fonction pour calculer le prix du swap (moyenne des forwards actualisés)
  const calculateSwapPrice = (forwards: number[], timeToMaturities: number[], r: number) => {
    const weightedSum = forwards.reduce((sum, forward, i) => {
      return sum + forward * Math.exp(-r * timeToMaturities[i]);
    }, 0);
    return weightedSum / forwards.length;
  };

  // Ajoutez cette fonction d'aide pour nettoyer les lignes CSV
  const cleanCSVLine = (line: string) => {
    return line
      .replace(/\r/g, '') // Enlever les retours chariot
      .replace(/^"|"$/g, '') // Enlever les guillemets au début et à la fin
      .split('","'); // Séparer sur les "," avec guillemets
  };

  // Modifiez la fonction handleFileUpload
  const handleFileUpload = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.txt';
    
    input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const rows = text.split('\n').filter(row => row.trim());
            
            const data: HistoricalDataPoint[] = rows
                .slice(1) // Ignore the header row
                .map(row => {
                    try {
                        const columns = cleanCSVLine(row);
                        if (columns.length < 2) {
                            console.error('Invalid row format:', row);
                            return null; // Ignore invalid rows
                        }
                        
                        // Parse date from first column (DD/MM/YYYY format)
                        const dateStr = columns[0];
                        const [day, month, year] = dateStr.split('/');
                        const date = new Date(`${year}-${month}-${day}`);
                        
                        // Validate date
                        if (isNaN(date.getTime())) {
                            console.error('Invalid date:', dateStr);
                            return null; // Ignore invalid dates
                        }

                        // Parse price from the "Dernier" column (second column)
                        const priceStr = columns[1].replace('.', '').replace(',', '.'); // Convert to a valid number format
                        const price = Number(priceStr);

                        if (isNaN(price)) {
                            console.error('Invalid price:', priceStr);
                            return null; // Ignore invalid prices
                        }

                        return {
                            date: date.toISOString().split('T')[0],
                            price: price
                        };
                    } catch (error) {
                        console.error('Error parsing row:', row, error);
                        return null;
                    }
                })
                .filter(row => row !== null) as HistoricalDataPoint[];

            if (data.length > 0) {
                console.log('Imported data:', data);
                setHistoricalData(data.sort((a, b) => b.date.localeCompare(a.date))); // Sort by date descending
                calculateMonthlyStats(data);
            } else {
                alert('No valid data found in CSV file. Please check the format.');
            }
        };
        reader.readAsText(file);
    };

    input.click();
  };

  // Fonction pour mettre à jour les données historiques manuellement
  const updateHistoricalData = (index: number, field: 'date' | 'price', value: string | number) => {
    const newData = [...historicalData];
    newData[index] = {
      ...newData[index],
      [field]: value
    };
    setHistoricalData(newData.sort((a, b) => a.date.localeCompare(b.date)));
    calculateMonthlyStats(newData);
  };

  // Fonction pour calculer les statistiques mensuelles
  const calculateMonthlyStats = (data: HistoricalDataPoint[]) => {
    const monthlyData: { [key: string]: number[] } = {};
    
    // Grouper les prix par mois
    data.forEach(point => {
        const date = new Date(point.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = [];
        }
        monthlyData[monthKey].push(point.price);
    });

    // Calculer les statistiques pour chaque mois
    const stats = Object.entries(monthlyData).map(([month, prices]) => {
        const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        
        // Calculer la volatilité historique
        const returns = prices.slice(1).map((price, i) => 
            Math.log(price / prices[i])
        );
        
        let volatility = null;
        if (returns.length > 0) {
            const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
            const variance = returns.reduce((sum, ret) => 
                sum + Math.pow(ret - avgReturn, 2), 0
            ) / (returns.length - 1);
            volatility = Math.sqrt(variance * 252);
        }

        return { month, avgPrice, volatility };
    });

    // Trier par date croissante
    setMonthlyStats(stats.sort((a, b) => a.month.localeCompare(b.month)));

    // Mettre à jour les prix réels et les volatilités pour la période sélectionnée
    const startDate = new Date(params.startDate);
    const endDate = new Date(startDate);
    endDate.setMonth(startDate.getMonth() + params.monthsToHedge);

    const newRealPrices = {};
    const newImpliedVols = {};
    
    stats.forEach(stat => {
        if (stat.avgPrice !== null) {
            newRealPrices[stat.month] = stat.avgPrice;
        }
        if (stat.volatility !== null) {
            newImpliedVols[stat.month] = stat.volatility * 100;
        }
    });

    setRealPrices(newRealPrices);
    setImpliedVolatilities(newImpliedVols);
    setUseImpliedVol(true);
    calculateResults();
  };

  // Ajouter un bouton pour ajouter une nouvelle ligne
  const addHistoricalDataRow = () => {
    setHistoricalData([
      ...historicalData,
      {
        date: new Date().toISOString().split('T')[0],
        price: 0
      }
    ]);
  };

  // Fonction pour ajouter un swap
  const addSwap = () => {
    // Calculer le prix du swap si on a des résultats
    let swapPrice = params.spotPrice;
    if (results) {
      const forwards = results.map(r => r.forward);
      const times = results.map(r => r.timeToMaturity);
      swapPrice = calculateSwapPrice(forwards, times, params.interestRate/100);
    }

    setStrategy([...strategy, {
      type: 'swap',
      strike: swapPrice,
      strikeType: 'absolute',
      volatility: 0, // Non utilisé pour le swap
      quantity: 100  // 100% par défaut
    }]);
  };

  // Ajouter cette fonction pour effacer les données
  const clearHistoricalData = () => {
    setHistoricalData([]);
    setMonthlyStats([]);
    setRealPrices({});
    setImpliedVolatilities({});
    setUseImpliedVol(false);
    calculateResults();
  };

  // Add a function to clear the active stress test
  const clearStressTest = () => {
    setActiveStressTest(null);
    
    // Restore Monte Carlo simulation if it was previously enabled
    setRealPriceParams(prev => ({
      ...prev,
      useSimulation: true // Enable simulation when clearing the scenario
    }));
    
    // Clear forwards to allow recalculation with base parameters
    setManualForwards({});
    
    // Calculate results with simulation enabled
    calculateResults();
  };

  return (
    <div id="content-to-pdf" className="w-full max-w-6xl mx-auto p-4 space-y-6">
      <style type="text/css" media="print">
        {`
          @page {
            size: portrait;
            margin: 20mm;
          }
          .scenario-content {
            max-width: 800px;
            margin: 0 auto;
          }
          .page-break {
            page-break-before: always;
          }
          table {
            page-break-inside: avoid;
            font-size: 12px;
          }
          .chart-container {
            page-break-inside: avoid;
            margin-bottom: 20px;
            height: 300px !important;
          }
        `}
      </style>
      {/* Add Clear Scenario button if a scenario is loaded */}
      {results && (
        <div className="flex justify-end">
          <Button
            variant="destructive"
            onClick={clearLoadedScenario}
            className="flex items-center gap-2"
          >
            Clear Loaded Scenario
          </Button>
        </div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="parameters">Strategy Parameters</TabsTrigger>
          <TabsTrigger value="stress">Stress Testing</TabsTrigger>
          <TabsTrigger value="backtest">Historical Backtest</TabsTrigger>
        </TabsList>
        
        <TabsContent value="parameters">
          <Card>
            <CardHeader>
              <CardTitle>Options Strategy Parameters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Start Date</label>
                  <Input
                    type="date"
                    value={params.startDate}
                    onChange={(e) => setParams({...params, startDate: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Months to Hedge</label>
                  <Input
                    type="number"
                    value={params.monthsToHedge}
                    onChange={(e) => setParams({...params, monthsToHedge: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Interest Rate (%)</label>
                  <Input
                    type="number"
                    value={params.interestRate}
                    onChange={(e) => setParams({...params, interestRate: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Total Volume</label>
                  <Input
                    type="number"
                    value={params.totalVolume}
                    onChange={(e) => setParams({...params, totalVolume: Number(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Spot Price</label>
                  <Input
                    type="number"
                    value={params.spotPrice}
                    onChange={(e) => handleSpotPriceChange(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="mt-6">
                <h3 className="text-lg font-medium mb-4">Real Price Simulation</h3>
                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    checked={realPriceParams.useSimulation}
                    onChange={(e) => setRealPriceParams(prev => ({...prev, useSimulation: e.target.checked}))}
                    className="mr-2"
                  />
                  <label>Use Monte Carlo Simulation</label>
                </div>
                <div className="flex items-center mb-4">
                  <input
                    type="checkbox"
                    checked={useImpliedVol}
                    onChange={(e) => setUseImpliedVol(e.target.checked)}
                    className="mr-2"
                  />
                  <label>Use Monthly Implied Volatility</label>
                    </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Strategy Components</CardTitle>
              <div className="flex gap-2">
              <Button onClick={addOption} className="flex items-center gap-2">
                <Plus size={16} /> Add Option
              </Button>
                <Button onClick={addSwap} className="flex items-center gap-2">
                  <Plus size={16} /> Add Swap
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {strategy.map((component, index) => (
                  <div key={index} className="grid grid-cols-6 gap-4 items-center p-4 border rounded">
                    <div>
                      <label className="block text-sm font-medium mb-1">Type</label>
                      <select
                        className="w-full p-2 border rounded"
                        value={component.type}
                        onChange={(e) => updateOption(index, 'type', e.target.value)}
                        disabled={component.type === 'swap'}
                      >
                        <option value="call">Call</option>
                        <option value="put">Put</option>
                        <option value="swap">Swap</option>
                      </select>
                    </div>
                    {component.type === 'swap' ? (
                      <>
                        <div className="col-span-2">
                          <label className="block text-sm font-medium mb-1">Swap Price</label>
                          <Input
                            type="number"
                            value={component.strike}
                            disabled
                            className="bg-gray-100"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-sm font-medium mb-1">Quantity (%)</label>
                          <Input
                            type="number"
                            value={component.quantity}
                            onChange={(e) => updateOption(index, 'quantity', Number(e.target.value))}
                            min="0"
                            max="100"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Strike</label>
                      <Input
                        type="number"
                            value={component.strike}
                        onChange={(e) => updateOption(index, 'strike', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Strike Type</label>
                      <select
                        className="w-full p-2 border rounded"
                            value={component.strikeType}
                        onChange={(e) => updateOption(index, 'strikeType', e.target.value)}
                      >
                        <option value="percent">Percentage</option>
                        <option value="absolute">Absolute</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Volatility (%)</label>
                      <Input
                        type="number"
                            value={component.volatility}
                        onChange={(e) => updateOption(index, 'volatility', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Quantity (%)</label>
                      <Input
                        type="number"
                            value={component.quantity}
                        onChange={(e) => updateOption(index, 'quantity', Number(e.target.value))}
                      />
                    </div>
                      </>
                    )}
                    <div className="flex items-end">
                      <Button
                        variant="destructive"
                        onClick={() => removeOption(index)}
                        className="flex items-center justify-center"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button onClick={calculateResults} className="w-full">
            Calculate Strategy Results
          </Button>
          {activeStressTest && (
            <Button 
              onClick={clearStressTest} 
              variant="outline" 
              className="w-full mt-2"
            >
              Clear Active Scenario
            </Button>
          )}
        </TabsContent>

        <TabsContent value="stress">
          <Card>
            <button
              onClick={() => toggleInputs('strategy')}
              className="w-full text-left bg-white rounded-md"
            >
              <div className="flex items-center justify-between p-3">
                <span className="font-medium">Strategy Components</span>
                <svg
                  className={`w-4 h-4 transform transition-transform ${showInputs['strategy'] ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>
            {showInputs['strategy'] && (
            <div className="px-3 pb-3">
              <div className="space-y-4">
                {strategy.map((option, index) => (
                  <div key={index} className="grid grid-cols-5 gap-4 items-end">
                    <div>
                      <label className="block text-sm font-medium mb-1">Type</label>
                      <select
                        className="w-full p-2 border rounded"
                        value={option.type}
                        onChange={(e) => updateOption(index, 'type', e.target.value)}
                      >
                        <option value="call">Call</option>
                        <option value="put">Put</option>
                        <option value="swap">Swap</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Strike</label>
                      <Input
                        type="number"
                        value={option.strike}
                        onChange={(e) => updateOption(index, 'strike', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Strike Type</label>
                      <select
                        className="w-full p-2 border rounded"
                        value={option.strikeType}
                        onChange={(e) => updateOption(index, 'strikeType', e.target.value)}
                      >
                        <option value="percentage">Percentage</option>
                        <option value="absolute">Absolute</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Volatility (%)</label>
                      <Input
                        type="number"
                        value={option.volatility}
                        onChange={(e) => updateOption(index, 'volatility', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Quantity (%)</label>
                      <Input
                        type="number"
                        value={option.quantity}
                        onChange={(e) => updateOption(index, 'quantity', Number(e.target.value))}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Stress Test Scenarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(stressTestScenarios).map(([key, scenario]) => (
                  <Card
                    key={key}
                    className={`w-full text-left p-3 hover:bg-gray-50 ${
                      activeStressTest === key ? 'border-2 border-blue-500' : ''
                    }`}
                  >
                    <button
                      onClick={() => toggleInputs(key)}
                      className="w-full text-left p-3 hover:bg-gray-50"
                    >
                      <div className="flex justify-between items-center">
                      <span className="font-medium">{scenario.name}</span>
                        <div className="flex items-center gap-2">
                          {activeStressTest === key && (
                            <span className="text-sm text-blue-500">Active</span>
                          )}
                      <svg
                            className={`w-4 h-4 transform transition-transform ${
                              showInputs[key] ? 'rotate-180' : ''
                            }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                        </div>
                      </div>
                    </button>
                    {showInputs[key] && (
                      <div className="px-3 pb-3">
                        <p className="text-xs text-gray-600 mb-2">{scenario.description}</p>
                        <div className="space-y-2">
                          {/* Only show volatility and drift for scenarios other than contango and backwardation */}
                          {key !== 'contango' && key !== 'backwardation' && (
                            <>
                          <div>
                                <label className="block text-sm font-medium mb-1">
                                  Volatility (%)
                                  <span className="text-xs text-gray-500 ml-1">
                                    (0-100)
                                  </span>
                                </label>
                            <Input
                              className="h-7"
                              type="number"
                              value={scenario.volatility * 100}
                                  onChange={(e) => {
                                    const value = Number(e.target.value);
                                    if (!isNaN(value) && value >= 0) {
                                      updateScenario(key, 'volatility', value / 100);
                                    }
                                  }}
                                  min="0"
                                  max="100"
                              step="0.1"
                            />
                          </div>
                          <div>
                                <label className="block text-sm font-medium mb-1">
                                  Drift (%)
                                  <span className="text-xs text-gray-500 ml-1">
                                    (-50 to 50)
                                  </span>
                                </label>
                            <Input
                              className="h-7"
                              type="number"
                              value={scenario.drift * 100}
                                  onChange={(e) => {
                                    const value = Number(e.target.value);
                                    if (!isNaN(value) && value >= -50 && value <= 50) {
                                      updateScenario(key, 'drift', value / 100);
                                    }
                                  }}
                                  min="-50"
                                  max="50"
                              step="0.1"
                            />
                          </div>
                            </>
                          )}
                          <div>
                            <label className="block text-sm font-medium mb-1">
                              Price Shock (%)
                              <span className="text-xs text-gray-500 ml-1">
                                {key === 'contango' ? '(Monthly price increase %)' : 
                                 key === 'backwardation' ? '(Monthly price decrease %)' : 
                                 '(-100 to 100)'}
                              </span>
                            </label>
                            <Input
                              className="h-7"
                              type="number"
                              value={scenario.priceShock * 100}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                if (!isNaN(value) && value >= 0 && value <= 100) {
                                  updateScenario(key, 'priceShock', value / 100);
                                }
                              }}
                              min="0"
                              max="100"
                              step="0.1"
                            />
                          </div>
                          {/* Display forwardBasis only for scenarios that use it and aren't contango/backwardation */}
                          {scenario.forwardBasis !== undefined && key !== 'contango' && key !== 'backwardation' && (
                            <div>
                              <label className="block text-sm font-medium mb-1">
                                Monthly Basis (%)
                                <span className="text-xs text-gray-500 ml-1">
                                  (-10 to 10)
                                </span>
                              </label>
                              <Input
                                className="h-7"
                                type="number"
                                value={scenario.forwardBasis * 100}
                                onChange={(e) => {
                                  const value = Number(e.target.value);
                                  if (!isNaN(value) && value >= -10 && value <= 10) {
                                    updateScenario(key, 'forwardBasis', value / 100);
                                  }
                                }}
                                min="-10"
                                max="10"
                                step="0.1"
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 mt-4">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            applyStressTest(key);
                          }}
                            className="flex-1 bg-[#0f172a] text-white hover:bg-[#1e293b]"
                        >
                          Run Scenario
                        </Button>
                          {scenario.isEditable && (
                            <Button
                              onClick={(e) => {
                                e.stopPropagation();
                                resetScenario(key);
                              }}
                              variant="outline"
                              className="flex-shrink-0"
                            >
                              Reset
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4 mt-6">
            <Button onClick={calculateResults} className="flex-1">
              Calculate Results
            </Button>
            {activeStressTest && (
              <Button 
                onClick={clearStressTest} 
                variant="outline" 
                className="w-full mt-2"
              >
                Clear Active Scenario
              </Button>
            )}
            {results && (
              <>
                <Button onClick={saveScenario} className="flex items-center gap-2">
                  <Save size={16} /> Save Scenario
                </Button>
                <Link to="/saved">
                  <Button variant="outline">View Saved Scenarios</Button>
                </Link>
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="backtest">
          <Card>
            <CardHeader>
              <CardTitle>Historical Data Input</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setShowHistoricalData(!showHistoricalData)}
                    >
                      {showHistoricalData ? 'Hide' : 'Show'} Historical Data
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => setShowMonthlyStats(!showMonthlyStats)}
                    >
                      {showMonthlyStats ? 'Hide' : 'Show'} Monthly Statistics
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={addHistoricalDataRow} 
                      variant="outline" 
                      className="flex items-center gap-2"
                    >
                      <Plus size={16} /> Add Row
                    </Button>
                    <Button 
                      onClick={handleFileUpload} 
                      className="flex items-center gap-2"
                    >
                      <Plus size={16} /> Import Historical Data
                    </Button>
                    <Button 
                      onClick={clearHistoricalData}
                      variant="destructive" 
                      className="flex items-center gap-2"
                    >
                      <Trash2 size={16} /> Clear Data
                    </Button>
                  </div>
                </div>
                
                {showHistoricalData && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-2">Date</th>
                          <th className="border p-2">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalData.map((row, index) => (
                          <tr key={index}>
                            <td className="border p-2">
                              <Input
                                type="date"
                                value={row.date}
                                onChange={(e) => updateHistoricalData(index, 'date', e.target.value)}
                              />
                            </td>
                            <td className="border p-2">
                              <Input
                                type="number"
                                value={row.price}
                                onChange={(e) => updateHistoricalData(index, 'price', Number(e.target.value))}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {showMonthlyStats && (
                  <div className="mt-4">
                    <h3 className="text-lg font-medium mb-2">Monthly Statistics</h3>
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-2">Month</th>
                          <th className="border p-2">Average Price</th>
                          <th className="border p-2">Historical Volatility</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyStats.map((stat, index) => (
                          <tr key={index}>
                            <td className="border p-2">{stat.month}</td>
                            <td className="border p-2">{stat.avgPrice.toFixed(2)}</td>
                            <td className="border p-2">{(stat.volatility * 100).toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {results && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Detailed Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="border p-2">Maturity</th>
                      <th className="border p-2">Time to Maturity</th>
                      <th className="border p-2 bg-gray-50">Forward Price</th>
                      <th className="border p-2 bg-blue-50">Real Price</th>
                      {useImpliedVol && (
                        <th className="border p-2 bg-yellow-50">IV (%)</th>
                      )}
                      {/* Afficher d'abord les colonnes de swap */}
                      {strategy.filter(s => s.type === 'swap').map((_, i) => (
                        <th key={`swap-${i}`} className="border p-2">Swap Price {i + 1}</th>
                      ))}
                      {/* Puis afficher les colonnes d'options */}
                      {strategy.filter(s => s.type !== 'swap').map((opt, i) => (
                        <th key={`option-${i}`} className="border p-2">
                          {opt.type === 'call' ? 'Call' : 'Put'} Price {i + 1}
                        </th>
                      ))}
                      <th className="border p-2">Strategy Price</th>
                      <th className="border p-2">Strategy Payoff</th>
                      <th className="border p-2">Volume</th>
                      <th className="border p-2">Hedged Cost</th>
                      <th className="border p-2">Unhedged Cost</th>
                      <th className="border p-2">Delta P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, i) => {
                      const [month, year] = row.date.split(' ');
                      const monthIndex = monthNames.indexOf(month);
                      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
                      return (
                      <tr key={i}>
                        <td className="border p-2">{row.date}</td>
                        <td className="border p-2">{row.timeToMaturity.toFixed(4)}</td>
                        <td className="border p-2">
                          <Input
                            type="number"
                            value={manualForwards[monthKey] || row.forward.toFixed(2)}
                            onChange={(e) => {
                              const newValue = e.target.value === '' ? '' : Number(e.target.value);
                              setManualForwards(prev => ({
                                ...prev,
                                [monthKey]: newValue
                              }));
                            }}
                            onBlur={() => calculateResults()}
                            className="w-32 text-right"
                            step="0.01"
                          />
                        </td>
                        <td className="border p-2">
                          <Input
                            type="number"
                            value={realPriceParams.useSimulation ? 
                              row.realPrice.toFixed(2) : 
                              (realPrices[monthKey] || row.forward)}
                            onChange={(e) => {
                              const newValue = e.target.value === '' ? '' : Number(e.target.value);
                              setRealPrices(prev => ({
                                ...prev,
                                [monthKey]: newValue
                              }));
                            }}
                            onBlur={() => calculateResults()}
                            className="w-32 text-right"
                            step="0.01"
                            disabled={realPriceParams.useSimulation}
                          />
                        </td>
                          {useImpliedVol && (
                            <td className="border p-2">
                              <Input
                                type="number"
                                value={impliedVolatilities[monthKey] || ''}
                                onChange={(e) => handleImpliedVolChange(monthKey, Number(e.target.value))}
                                onBlur={() => calculateResults()}
                                className="w-24"
                                placeholder="Enter IV"
                              />
                            </td>
                          )}
                          {/* Afficher d'abord les prix des swaps */}
                          {row.optionPrices
                            .filter(opt => opt.type === 'swap')
                            .map((opt, j) => (
                              <td key={`swap-${j}`} className="border p-2">{opt.price.toFixed(2)}</td>
                            ))}
                          {/* Puis afficher les prix des options */}
                          {row.optionPrices
                            .filter(opt => opt.type !== 'swap')
                            .map((opt, j) => (
                              <td key={`option-${j}`} className="border p-2">{opt.price.toFixed(2)}</td>
                        ))}
                        <td className="border p-2">{row.strategyPrice.toFixed(2)}</td>
                        <td className="border p-2">{row.totalPayoff.toFixed(2)}</td>
                        <td className="border p-2">{row.monthlyVolume.toFixed(0)}</td>
                        <td className="border p-2">{row.hedgedCost.toFixed(2)}</td>
                        <td className="border p-2">{row.unhedgedCost.toFixed(2)}</td>
                        <td className="border p-2">{row.deltaPnL.toFixed(2)}</td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>P&L Evolution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="deltaPnL" name="Delta P&L" stroke="#8884d8" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Real vs Forward Prices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="forward" 
                      name="Forward Price" 
                      stroke="#8884d8" 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="realPrice"
                      name="Real Price"
                      stroke="#82ca9d"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {payoffData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Payoff Diagram at Maturity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-96">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={payoffData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis 
                        dataKey="price" 
                        label={{ value: 'Underlying Price', position: 'insideBottom', offset: -5 }}
                      />
                      <YAxis 
                        label={{ value: 'Payoff', angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip />
                      <Line 
                        type="monotone" 
                        dataKey="payoff" 
                        name="Strategy Payoff" 
                        stroke="#82ca9d" 
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 text-sm text-gray-600">
                  <p>Payoff Diagram Explanation:</p>
                  <ul className="list-disc pl-5">
                    <li>Shows the total payoff of your option strategy at maturity</li>
                    <li>The x-axis represents the underlying price</li>
                    <li>The y-axis shows the corresponding payoff value</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Summary Statistics by Year</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                {(() => {
                  const yearlyResults = calculateYearlyResults(results);

                  return (
                    <table className="w-full border-collapse mb-6">
                      <thead>
                        <tr>
                          <th className="border p-2 text-left">Year</th>
                          <th className="border p-2 text-right">Total Cost with Hedging</th>
                          <th className="border p-2 text-right">Total Cost without Hedging</th>
                          <th className="border p-2 text-right">Total P&L</th>
                          <th className="border p-2 text-right">Cost Reduction (%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(yearlyResults).map(([year, data]) => (
                          <tr key={year}>
                            <td className="border p-2 font-medium">{year}</td>
                            <td className="border p-2 text-right">
                              {data.hedgedCost.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                            <td className="border p-2 text-right">
                              {data.unhedgedCost.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                            <td className="border p-2 text-right">
                              {data.deltaPnL.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })}
                            </td>
                            <td className="border p-2 text-right">
                                  {(((data.deltaPnL / Math.abs(data.unhedgedCost)) * 100).toFixed(2) + '%')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Summary Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="border p-2 font-medium">Total Cost with Hedging</td>
                      <td className="border p-2 text-right">
                        {results.reduce((sum, row) => sum + row.hedgedCost, 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Total Cost without Hedging</td>
                      <td className="border p-2 text-right">
                        {results.reduce((sum, row) => sum + row.unhedgedCost, 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Total P&L</td>
                      <td className="border p-2 text-right">
                        {results.reduce((sum, row) => sum + row.deltaPnL, 0).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </td>
                    </tr>
                    <tr>
                      <td className="border p-2 font-medium">Cost Reduction (%)</td>
                      <td className="border p-2 text-right">
                        {(() => {
                          const totalPnL = results.reduce((sum, row) => sum + row.deltaPnL, 0);
                          const totalUnhedgedCost = results.reduce((sum, row) => sum + row.unhedgedCost, 0);
                              return (((totalPnL / Math.abs(totalUnhedgedCost)) * 100).toFixed(2) + '%');
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Index; 


