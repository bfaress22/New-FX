import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Plus, Trash2, Save, X, AlertTriangle, Table } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from 'react-router-dom';
import { CalculatorState, CustomPeriod } from '@/types/CalculatorState';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import MonteCarloVisualization from '../components/MonteCarloVisualization';
import { SimulationData } from '../components/MonteCarloVisualization';
import { Switch } from "@/components/ui/switch";
import { v4 as uuidv4 } from 'uuid';

export interface StressTestScenario {
  name: string;
  description: string;
  volatility: number;
  drift: number;
  priceShock: number;
  forwardBasis?: number;
  realBasis?: number;
  isCustom?: boolean;
  isEditable?: boolean;
  isHistorical?: boolean;
  historicalData?: HistoricalDataPoint[];
}

export interface StrategyComponent {
  type: 'call' | 'put' | 'swap' | 'call-knockout' | 'call-reverse-knockout' | 'call-double-knockout' | 
         'put-knockout' | 'put-reverse-knockout' | 'put-double-knockout' | 
         'call-knockin' | 'call-reverse-knockin' | 'call-double-knockin' |
         'put-knockin' | 'put-reverse-knockin' | 'put-double-knockin';
  strike: number;
  strikeType: 'percent' | 'absolute';
  volatility: number;
  quantity: number;
  barrier?: number;           // Primary barrier level
  secondBarrier?: number;     // Secondary barrier for double barriers
  barrierType?: 'percent' | 'absolute';  // Whether barrier is % of spot or absolute value
}

export interface Result {
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
    useCustomPeriods?: boolean;
    customPeriods?: CustomPeriod[];
  };
  strategy: StrategyComponent[];
  results: Result[];
  payoffData: Array<{ price: number; payoff: number }>;
  stressTest?: StressTestScenario;
  // Ajouter les données additionnelles du tableau
  useImpliedVol: boolean;
  impliedVolatilities: {[key: string]: number};
  manualForwards: {[key: string]: number};
  realPrices: {[key: string]: number};
  customOptionPrices?: {[key: string]: {[optionKey: string]: number}};
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
  volatility: number | null;
}

interface PriceRange {
  min: number;
  max: number;
  probability: number;
}

interface RiskMatrixResult {
  strategy: StrategyComponent[];
  coverageRatio: number;
  costs: {[key: string]: number};
  differences: {[key: string]: number};
  hedgingCost: number;
  name: string; // Ajout de la propriété name
}

// Ajouter cette interface pour les matrices de risque sauvegardées
interface SavedRiskMatrix {
  id: string;
  name: string;
  timestamp: number;
  priceRanges: PriceRange[];
  strategies: {
    components: StrategyComponent[];
    coverageRatio: number;
    name: string;
  }[];
  results: RiskMatrixResult[];
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
      spotPrice: 100,
      useCustomPeriods: false,
      customPeriods: []
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
  const [realPriceParams, setRealPriceParams] = useState<{
    useSimulation: boolean;
    volatility: number;
    drift: number;
    numSimulations: number;
  }>({
      useSimulation: false,
      volatility: 0.3,
    drift: 0,
      numSimulations: 1000
  });

  const [barrierOptionSimulations, setBarrierOptionSimulations] = useState<number>(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).barrierOptionSimulations || 1000 : 1000;
  });
  
  const [useClosedFormBarrier, setUseClosedFormBarrier] = useState<boolean>(() => {
    const savedState = localStorage.getItem('calculatorState');
    return savedState ? JSON.parse(savedState).useClosedFormBarrier || false : false;
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
    return savedState ? JSON.parse(savedState).stressTestScenarios : {
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
    };
  });

  // Add this new state
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

  // État pour les prix d'options personnalisés
  const [useCustomOptionPrices, setUseCustomOptionPrices] = useState(false);
  const [customOptionPrices, setCustomOptionPrices] = useState<{[key: string]: {[key: string]: number}}>({});
  
  // Historical data and monthly stats
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);
  const [showHistoricalData, setShowHistoricalData] = useState(true);
  const [showMonthlyStats, setShowMonthlyStats] = useState(true);

  const [priceRanges, setPriceRanges] = useState<PriceRange[]>([
    { min: 30, max: 60, probability: 43 },
    { min: 60, max: 80, probability: 27 },
    { min: 80, max: 120, probability: 22 },
    { min: 120, max: 200, probability: 5 }
  ]);

  const [matrixStrategies, setMatrixStrategies] = useState<{
    components: StrategyComponent[];
    coverageRatio: number;
    name: string;
  }[]>([]);

  const [riskMatrixResults, setRiskMatrixResults] = useState<RiskMatrixResult[]>([]);

  // Ajouter cet état
  const [savedRiskMatrices, setSavedRiskMatrices] = useState<SavedRiskMatrix[]>(() => {
    const saved = localStorage.getItem('savedRiskMatrices');
    return saved ? JSON.parse(saved) : [];
  });

  // Ajouter un état pour stocker les volumes personnalisés par mois
  const [customVolumes, setCustomVolumes] = useState<Record<string, number>>({});

  // Ajouter une fonction pour gérer les changements de volume
  const handleVolumeChange = (monthKey: string, newVolume: number) => {
    // Mettre à jour l'état des volumes personnalisés
    setCustomVolumes(prev => ({
      ...prev,
      [monthKey]: newVolume
    }));
    
    // Recalculer les résultats avec les nouveaux volumes
    recalculateResults();
  };

  // Fonction pour recalculer les résultats avec les volumes personnalisés
  const recalculateResults = () => {
    if (!results) return;
    
    // Create copy of results
    const updatedResults = [...results];
    
    // Update each result with new data
    updatedResults.forEach(result => {
      const date = new Date(result.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      // Update forward price if available in manual forwards
      if (manualForwards[monthKey]) {
        result.forward = manualForwards[monthKey];
      }
      
      // Update real price if available in real prices
      if (realPrices[monthKey]) {
        result.realPrice = realPrices[monthKey];
      }
      
      // Recalculate option prices with current parameters and IV
      result.optionPrices.forEach(option => {
        const strike = option.strike;
        
        // Use custom option prices if enabled
        if (useCustomOptionPrices && customOptionPrices[monthKey]?.[`${option.type}-${option.label}`]) {
          option.price = customOptionPrices[monthKey][`${option.type}-${option.label}`];
        } else {
          // Otherwise recalculate price with current parameters
          // Note: Pass date to calculateOptionPrice to use implied volatility if available
          option.price = calculateOptionPrice(
            option.type, 
            result.forward, 
            strike, 
            params.interestRate/100, 
            result.timeToMaturity,
            option.type.includes('swap') ? 0 : 
            option.type.includes('barrier') || option.type.includes('knockout') || option.type.includes('knockin') ? 
              (strategy.find(opt => opt.type === option.type)?.volatility || 20) / 100 :
              (strategy.find(opt => opt.type === option.type)?.volatility || 20) / 100,
            date // Pass date to use implied volatility if enabled
          );
        }
      });
      
      // Recalculate strategy price
      result.strategyPrice = result.optionPrices.reduce((sum, opt) => sum + opt.price * opt.quantity/100, 0);
      
      // Recalculate hedged cost, unhedged cost, delta P&L
      const monthlyPayoff = result.realPrice - result.forward;
      result.totalPayoff = monthlyPayoff * result.monthlyVolume;
      result.hedgedCost = result.strategyPrice * result.monthlyVolume;
      result.unhedgedCost = result.totalPayoff;
      result.deltaPnL = result.unhedgedCost - result.hedgedCost;
    });
    
    // Update results state
    setResults(updatedResults);
  };

  // Add this function for Monte Carlo simulation of barrier options
  const calculateBarrierOptionPrice = (
    optionType: string,
    S: number,      // Current price
    K: number,      // Strike price
    r: number,      // Risk-free rate
    t: number,      // Time to maturity in years
    sigma: number,  // Volatility
    barrier: number, // Barrier level
    secondBarrier?: number, // Second barrier for double barrier options
    numSimulations: number = 1000 // Number of simulations
  ) => {
    // Generate a simple price path for this specific option
      const numSteps = Math.max(252 * t, 50); // At least 50 steps
      const dt = t / numSteps;
      
    // Generate paths for just this one option
    const paths = [];
    for (let i = 0; i < numSimulations; i++) {
      const path = [S]; // Start with current price
      
      // Simulate price path
      for (let step = 0; step < numSteps; step++) {
        const previousPrice = path[path.length - 1];
        // Generate random normal variable
        const randomWalk = Math.random() * 2 - 1; // Simple approximation of normal distribution
        
        // Update price using geometric Brownian motion
        const nextPrice = previousPrice * Math.exp(
          (r - 0.5 * Math.pow(sigma, 2)) * dt + 
          sigma * Math.sqrt(dt) * randomWalk
        );
        
        path.push(nextPrice);
      }
      
      paths.push(path);
    }
    
    // Use our new function to calculate the price
    const optionPrice = calculatePricesFromPaths(
      optionType,
      S,
      K,
      r,
      numSteps, // The final index in the path
      paths,
      barrier,
      secondBarrier
    );

    // S'assurer que le prix de l'option n'est jamais négatif
    return Math.max(0, optionPrice);
  };

  // Modify the calculateOptionPrice function to handle barrier options
  const calculateOptionPrice = (type, S, K, r, t, sigma, date?) => {
    // Utilize the volatility implied if available
    let effectiveSigma = sigma;
    if (date && useImpliedVol) {
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      if (impliedVolatilities[monthKey]) {
        effectiveSigma = impliedVolatilities[monthKey] / 100;
      }
    }

    // If it's a barrier option, use Monte Carlo simulation or closed-form solution based on flag
    if (type.includes('knockout') || type.includes('knockin')) {
      // Find the option in the strategy to get barrier values
      const option = strategy.find(opt => opt.type === type);
      if (!option) return 0;

      // Calculate barrier values
      const barrier = option.barrierType === 'percent' ? 
        params.spotPrice * (option.barrier / 100) : 
        option.barrier;
        
      const secondBarrier = option.type.includes('double') ? 
        (option.barrierType === 'percent' ? 
          params.spotPrice * (option.secondBarrier / 100) : 
          option.secondBarrier) : 
        undefined;
      
      // Use closed-form solution if enabled and appropriate for the option type
      if (useClosedFormBarrier && !type.includes('double') && !type.includes('reverse')) {
        return Math.max(0, calculateBarrierOptionClosedForm(
          type,
          S,
          K,
          r,
          t,
          effectiveSigma, // Use implied vol if available
          barrier,
          secondBarrier
        ));
      } else {
        // Otherwise use Monte Carlo simulation
        return Math.max(0, calculateBarrierOptionPrice(
          type,
          S,
          K,
          r,
          t,
          effectiveSigma, // Use implied vol if available
          barrier,
          secondBarrier,
          barrierOptionSimulations // Use the number of simulations specific to barrier options
        ));
      }
    }
    
    // For standard options, use Black-Scholes
    const d1 = (Math.log(S/K) + (r + effectiveSigma**2/2)*t) / (effectiveSigma*Math.sqrt(t));
    const d2 = d1 - effectiveSigma*Math.sqrt(t);
    
    const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
    const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
    
    let price = 0;
    if (type === 'call') {
      price = S*Nd1 - K*Math.exp(-r*t)*Nd2;
    } else { // put
      price = K*Math.exp(-r*t)*(1-Nd2) - S*(1-Nd1);
    }
    
    // S'assurer que le prix de l'option n'est jamais négatif
    return Math.max(0, price);
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

  // Generate price paths for the entire period using Monte Carlo
  const generatePricePathsForPeriod = (months, startDate, numSimulations = 1000) => {
    const paths = [];
    const timeToMaturities = months.map(date => {
      const diffTime = Math.abs(date.getTime() - startDate.getTime());
      return diffTime / (365.25 * 24 * 60 * 60 * 1000);
    });
    
    const maxMaturity = Math.max(...timeToMaturities);
    const numSteps = Math.max(252 * maxMaturity, 50); // At least 50 steps, or daily steps
    const dt = maxMaturity / numSteps;
    
    // Pre-calculate monthly indices in the path
    const monthlyIndices = timeToMaturities.map(t => Math.floor(t / maxMaturity * numSteps));
    
    // Generate paths
    for (let i = 0; i < numSimulations; i++) {
      const path = [params.spotPrice]; // Start with current spot price
      
      // Simulate full path
      for (let step = 0; step < numSteps; step++) {
        const previousPrice = path[path.length - 1];
        // Generate random normal variable
        const randomWalk = Math.random() * 2 - 1; // Simple approximation of normal distribution
        
        // Update price using geometric Brownian motion
        const nextPrice = previousPrice * Math.exp(
          (params.interestRate/100 - 0.5 * Math.pow(realPriceParams.volatility, 2)) * dt + 
          realPriceParams.volatility * Math.sqrt(dt) * randomWalk
        );
        
        path.push(nextPrice);
      }
      
      paths.push(path);
    }
    
    return { paths, monthlyIndices };
  };

  // Calculate option prices and payoffs from price paths
  const calculatePricesFromPaths = (
    optionType, 
    S, 
    K, 
    r, 
    maturityIndex,
    paths,
    barrier?,
    secondBarrier?
  ) => {
    let priceSum = 0;
    const numSimulations = paths.length;
    
    for (let i = 0; i < numSimulations; i++) {
      const path = paths[i];
      const finalPrice = path[maturityIndex];
      let payoff = 0;
      let barrierHit = false;
      
      // Check for barrier events along the path up to maturity
      if (barrier && (optionType.includes('knockout') || optionType.includes('knockin'))) {
        for (let step = 0; step <= maturityIndex; step++) {
          const pathPrice = path[step];
          
          // Check barrier logic based on option type
          const isAboveBarrier = pathPrice >= barrier;
          const isBelowBarrier = pathPrice <= barrier;
          
          // Apply same barrier logic as in the original function
          if (optionType.includes('knockout')) {
            if (optionType.includes('reverse')) {
              if (optionType.includes('put')) {
                // Put Reverse KO: Knocked out if price goes ABOVE barrier
                if (isAboveBarrier) {
                  barrierHit = true;
                  break;
                }
              } else {
                // Call Reverse KO: Knocked out if price goes BELOW barrier
                if (isBelowBarrier) {
                  barrierHit = true;
                  break;
                }
              }
            } else if (optionType.includes('double')) {
              // Double KO: Knocked out if price crosses either barrier
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              
              // Vérifier si le prix touche soit la barrière supérieure, soit la barrière inférieure
              // Pour un Call Double KO, l'option est invalidée si le prix monte trop haut ou descend trop bas
              if ((pathPrice >= upperBarrier) || (pathPrice <= lowerBarrier)) {
                barrierHit = true;
                break;
              }
            } else {
              if (optionType.includes('put')) {
                // Put KO: Knocked out if price goes BELOW barrier
                if (isBelowBarrier) {
                  barrierHit = true;
                  break;
                }
              } else {
                // Call KO: Knocked out if price goes ABOVE barrier
                if (isAboveBarrier) {
                  barrierHit = true;
                  break;
                }
              }
            }
          } else if (optionType.includes('knockin')) {
            if (optionType.includes('reverse')) {
              if (optionType.includes('put')) {
                // Put Reverse KI: Knocked in if price goes ABOVE barrier
                if (isAboveBarrier) {
                  barrierHit = true;
                }
              } else {
                // Call Reverse KI: Knocked in if price goes BELOW barrier
                if (isBelowBarrier) {
                  barrierHit = true;
                }
              }
            } else if (optionType.includes('double')) {
              // Double KI: Knocked in if price crosses either barrier
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              if (pathPrice >= upperBarrier || pathPrice <= lowerBarrier) {
                barrierHit = true;
              }
            } else {
              if (optionType.includes('put')) {
                // Put KI: Knocked in if price goes BELOW barrier
                if (isBelowBarrier) {
                  barrierHit = true;
                }
              } else {
                // Call KI: Knocked in if price goes ABOVE barrier
                if (isAboveBarrier) {
                  barrierHit = true;
                }
              }
            }
          }
        }
      }
      
      // Calculate payoff
      const isCall = optionType.includes('call') || (!optionType.includes('put') && !optionType.includes('swap'));
      const baseOptionPayoff = isCall ? 
        Math.max(0, finalPrice - K) : 
        Math.max(0, K - finalPrice);
      
      if (!barrier) {
        // Standard option
        payoff = baseOptionPayoff;
      } else if (optionType.includes('knockout')) {
        // Knockout option
        // Une fois que la barrière est touchée (barrierHit=true), l'option est invalidée définitivement
        // et le payoff reste à zéro, même si le prix revient dans la zone favorable
        if (!barrierHit) {
          payoff = baseOptionPayoff;
        }
      } else if (optionType.includes('knockin')) {
        // Knockin option
        if (barrierHit) {
          payoff = baseOptionPayoff;
        }
      }
      
      priceSum += payoff;
    }
    
    // Average payoff discounted back to present value
    const t = maturityIndex / (252 * paths[0].length); // Approximate time to maturity
    return (priceSum / numSimulations) * Math.exp(-r * t);
  };

  // Modify the calculatePayoff function to handle barrier options
  const calculatePayoff = () => {
    if (strategy.length === 0) return;

    const spotPrice = params.spotPrice;
    const priceRange = Array.from({length: 101}, (_, i) => spotPrice * (0.5 + i * 0.01));
    
    // Generate Monte Carlo paths for 1 year (standard for payoff diagrams)
    const numSteps = 252; // Daily steps for a year
    const numSimulations = 500; // Fewer simulations for the payoff diagram
    const paths = [];
    
    for (let i = 0; i < numSimulations; i++) {
      const path = [spotPrice];
      const dt = 1/252; // Daily step
      
      for (let step = 0; step < numSteps; step++) {
        const previousPrice = path[path.length - 1];
        const randomWalk = Math.random() * 2 - 1;
        const nextPrice = previousPrice * Math.exp(
          (params.interestRate/100 - Math.pow(realPriceParams.volatility, 2)/2) * dt + 
          realPriceParams.volatility * Math.sqrt(dt) * randomWalk
        );
        path.push(nextPrice);
      }
      paths.push(path);
    }

    const payoffCalculation = priceRange.map(price => {
      let totalPayoff = 0;

      strategy.forEach(option => {
        const strike = option.strikeType === 'percent' 
          ? params.spotPrice * (option.strike / 100) 
          : option.strike;

        const quantity = option.quantity / 100;

        // Calculate option price based on type
        let optionPremium;
        
        if (option.type === 'call' || option.type === 'put') {
          // Use Black-Scholes for vanilla options
          const d1 = (Math.log(spotPrice/strike) + (params.interestRate/100 + (option.volatility/100)**2/2)*1) / ((option.volatility/100)*Math.sqrt(1));
          const d2 = d1 - (option.volatility/100)*Math.sqrt(1);
          
          const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
          const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
          
          if (option.type === 'call') {
            optionPremium = spotPrice*Nd1 - strike*Math.exp(-params.interestRate/100*1)*Nd2;
          } else { // put
            optionPremium = strike*Math.exp(-params.interestRate/100*1)*(1-Nd2) - spotPrice*(1-Nd1);
          }
        } else if (option.type.includes('knockout') || option.type.includes('knockin')) {
          // Use Monte Carlo for barrier options
          const barrier = option.barrierType === 'percent' ? 
            params.spotPrice * (option.barrier / 100) : 
            option.barrier;
            
          const secondBarrier = option.type.includes('double') ? 
            (option.barrierType === 'percent' ? 
              params.spotPrice * (option.secondBarrier / 100) : 
              option.secondBarrier) : 
            undefined;
            
          optionPremium = calculatePricesFromPaths(
          option.type,
          spotPrice,
          strike,
          params.interestRate/100,
            numSteps,
            paths,
            barrier,
            secondBarrier
          );
        } else if (option.type === 'swap') {
          // For swaps, premium is typically negligible for payoff diagrams
          optionPremium = 0;
        }

        // Calculate payoff at this price point
        let payoff = 0;
        
        if (option.type === 'call') {
          payoff = Math.max(0, price - strike);
        } else if (option.type === 'put') {
          payoff = Math.max(0, strike - price);
        } else if (option.type === 'swap') {
          payoff = spotPrice - price;
        } else if (option.type.includes('knockout') || option.type.includes('knockin')) {
          // Approche simplifiée pour les graphiques de payoff des options à barrière
          // Note: Ceci est une approximation pour la visualisation, qui ne capture pas
          // complètement la nature path-dependent de ces options
          
          const barrier = option.barrierType === 'percent' ? 
            params.spotPrice * (option.barrier / 100) : 
            option.barrier;
          
          const secondBarrier = option.type.includes('double') ? 
            (option.barrierType === 'percent' ? 
              params.spotPrice * (option.secondBarrier / 100) : 
              option.secondBarrier) : 
            undefined;
          
          let isBarrierBroken = false;
          
          // Vérifier si le prix franchit une barrière selon le type d'option
          if (option.type.includes('knockout')) {
          if (option.type.includes('reverse')) {
            if (option.type.includes('put')) {
                // Put Reverse KO: Knocked out si au-dessus de la barrière
                isBarrierBroken = price >= barrier;
        } else {
                // Call Reverse KO: Knocked out si en-dessous de la barrière
                isBarrierBroken = price <= barrier;
            }
          } else if (option.type.includes('double')) {
              // Double KO: Knocked out si en dehors des deux barrières
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              isBarrierBroken = price >= upperBarrier || price <= lowerBarrier;
          } else {
            if (option.type.includes('put')) {
                // Put Standard KO: Knocked out si en-dessous de la barrière
                isBarrierBroken = price <= barrier;
            } else {
                // Call Standard KO: Knocked out si au-dessus de la barrière
                isBarrierBroken = price >= barrier;
              }
            }
          } else if (option.type.includes('knockin')) {
            if (option.type.includes('reverse')) {
              if (option.type.includes('put')) {
                // Put Reverse KI: Knocked in si au-dessus de la barrière
                isBarrierBroken = price >= barrier;
              } else {
                // Call Reverse KI: Knocked in si en-dessous de la barrière
                isBarrierBroken = price <= barrier;
              }
            } else if (option.type.includes('double')) {
              // Double KI: Knocked in si en dehors des deux barrières
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              isBarrierBroken = price >= upperBarrier || price <= lowerBarrier;
            } else {
              if (option.type.includes('put')) {
                // Put Standard KI: Knocked in si en-dessous de la barrière
                isBarrierBroken = price <= barrier;
              } else {
                // Call Standard KI: Knocked in si au-dessus de la barrière
                isBarrierBroken = price >= barrier;
              }
            }
          }
          
          // Calculer le payoff en fonction du type d'option et du franchissement de barrière
          const isCall = option.type.includes('call');
          const basePayoff = isCall ? 
            Math.max(0, price - strike) : 
            Math.max(0, strike - price);
          
          if (option.type.includes('knockout')) {
            // Pour les options Knock-Out, le payoff est nul si la barrière est franchie
            payoff = isBarrierBroken ? 0 : basePayoff;
          } else { // knockin
            // Pour les options Knock-In, le payoff n'est non-nul que si la barrière est franchie
            payoff = isBarrierBroken ? basePayoff : 0;
          }
        }
        
        // Subtract premium for net payoff
        const netPayoff = payoff - optionPremium;
        totalPayoff += netPayoff * quantity;
      });

      return { price, payoff: totalPayoff };
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
      quantity: 100,
      barrier: 120,       // Default barrier at 120% of spot
      secondBarrier: 80,  // Default second barrier at 80% of spot
      barrierType: 'percent'
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
    let months = [];
    let monthlyVolumes = [];

    // Check if we're using custom periods or standard months
    if (params.useCustomPeriods && params.customPeriods.length > 0) {
      // Sort custom periods by maturity date
      const sortedPeriods = [...params.customPeriods].sort(
        (a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime()
      );
      
      // Convert custom periods to months array
      months = sortedPeriods.map(period => new Date(period.maturityDate));
      
      // Use the volumes defined in custom periods
      monthlyVolumes = sortedPeriods.map(period => period.volume);
    } else {
      // Use the standard month generation logic
      let currentDate = new Date(startDate);
    const lastDayOfStartMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const remainingDaysInMonth = lastDayOfStartMonth.getDate() - currentDate.getDate() + 1;

    if (remainingDaysInMonth > 0) {
      months.push(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
    }

    for (let i = 0; i < params.monthsToHedge - (remainingDaysInMonth > 0 ? 1 : 0); i++) {
      currentDate.setMonth(currentDate.getMonth() + 1);
      months.push(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
      }
      
      // Use equal volumes for each month
      const monthlyVolume = params.totalVolume / months.length;
      monthlyVolumes = Array(months.length).fill(monthlyVolume);
    }

    // Generate price paths for the entire period
    const { paths, monthlyIndices } = generatePricePathsForPeriod(months, startDate, realPriceParams.numSimulations);

    // If simulation is enabled, generate new real prices using the first path
    if (realPriceParams.useSimulation) {
      const simulatedPrices = {};
      months.forEach((date, idx) => {
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        // Use the first simulated path as the 'real' price path
        simulatedPrices[monthKey] = paths[0][monthlyIndices[idx]];
      });
      setRealPrices(simulatedPrices);
    }

    // Prepare Monte Carlo visualization data once we have paths
    const timeLabels = months.map(
      (date) => `${date.getFullYear()}-${date.getMonth() + 1}`
    );

    // Select randomly up to 100 paths to display
    const maxDisplayPaths = Math.min(100, paths.length);
    const selectedPathIndices = [];
    
    // If we have fewer than 100 paths, use all of them
    if (paths.length <= maxDisplayPaths) {
      for (let i = 0; i < paths.length; i++) {
        selectedPathIndices.push(i);
      }
    } else {
      // Otherwise, select 100 random indices
      while (selectedPathIndices.length < maxDisplayPaths) {
        const randomIndex = Math.floor(Math.random() * paths.length);
        if (!selectedPathIndices.includes(randomIndex)) {
          selectedPathIndices.push(randomIndex);
        }
      }
    }
    
    // Create the real price paths data
    const realPricePaths = selectedPathIndices.map(pathIndex => 
      monthlyIndices.map(idx => paths[pathIndex][idx])
    );

    // Calculate barrier option prices if we have barrier options
    const barrierOptions = strategy.filter(
      (opt) => opt.type.includes('knockout') || opt.type.includes('knockin')
    );

    const barrierOptionPricePaths: number[][] = [];

    if (barrierOptions.length > 0) {
      // For simplicity, use the first barrier option
      const barrierOption = barrierOptions[0];
      
      // Calculate barrier value
      const barrier = barrierOption.barrierType === 'percent' 
        ? params.spotPrice * (barrierOption.barrier! / 100) 
        : barrierOption.barrier!;
      
      const secondBarrier = barrierOption.type.includes('double')
        ? barrierOption.barrierType === 'percent'
          ? params.spotPrice * (barrierOption.secondBarrier! / 100)
          : barrierOption.secondBarrier
        : undefined;
        
      // Calculate strike
      const strike = barrierOption.strikeType === 'percent'
        ? params.spotPrice * (barrierOption.strike / 100)
        : barrierOption.strike;

      // Calculate option prices for selected paths
      for (const pathIndex of selectedPathIndices) {
        const path = paths[pathIndex];
        const optionPrices: number[] = [];
        
        // For each month, calculate the option price
        for (let monthIdx = 0; monthIdx < monthlyIndices.length; monthIdx++) {
          const maturityIndex = monthlyIndices[monthIdx];
          
          // Calculate option price at this point
          const optionPrice = calculatePricesFromPaths(
            barrierOption.type,
            params.spotPrice,
            strike,
            params.interestRate/100,
            maturityIndex,
            [path],
            barrier,
            secondBarrier
          );
          
          optionPrices.push(optionPrice);
        }
        
        barrierOptionPricePaths.push(optionPrices);
      }
    }

    // Update visualization data with the calculated paths
    setSimulationData({
      realPricePaths,
      timeLabels,
      strategyName: barrierOptions.length > 0 
        ? `${barrierOptions[0].type} at ${barrierOptions[0].strike}` 
        : 'Current Strategy',
    });

    // Continue with the rest of calculateResults
    const timeToMaturities = months.map(date => {
      const diffTime = Math.abs(date.getTime() - startDate.getTime());
      return diffTime / (365.25 * 24 * 60 * 60 * 1000);
    });

    // Suivi des options knocked out
    const knockedOutOptions = new Set();
    
    // Pour chaque chemin de simulation, vérifier à l'avance les franchissements de barrière
    const barrierCrossings = {};
    // Pour suivre les options knock-in activées
    const barrierActivations = {};
    
    strategy.forEach((option, optIndex) => {
      // Gestion des options knockout
      if (option.type.includes('knockout')) {
        const optionId = `${option.type}-${optIndex}`;
        barrierCrossings[optionId] = [];
        
        // Vérifier les franchissements sur le chemin principal (celui utilisé pour les real prices)
        const barrier = option.barrierType === 'percent' ? 
          params.spotPrice * (option.barrier / 100) : 
          option.barrier;
          
        const secondBarrier = option.type.includes('double') ? 
          (option.barrierType === 'percent' ? 
            params.spotPrice * (option.secondBarrier / 100) : 
            option.secondBarrier) : 
          undefined;
        
        // Vérifier le franchissement pour chaque mois
        let isKnockedOut = false;
        
        months.forEach((date, monthIndex) => {
          const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
          const realPrice = realPrices[monthKey] || 0;
          
          // Vérifier si cette option serait knocked out
          let barrierCrossed = false;
          if (!isKnockedOut) { // Ne vérifier que si l'option n'est pas déjà knocked out
            if (option.type.includes('reverse')) {
              if (option.type.includes('put')) {
                // Put Reverse KO: Knocked out si prix au-dessus de la barrière
                barrierCrossed = realPrice >= barrier;
              } else {
                // Call Reverse KO: Knocked out si prix en-dessous de la barrière
                barrierCrossed = realPrice <= barrier;
              }
            } else if (option.type.includes('double')) {
              // Double KO: Knocked out si prix en dehors des deux barrières
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              barrierCrossed = realPrice >= upperBarrier || realPrice <= lowerBarrier;
            } else {
              if (option.type.includes('put')) {
                // Put Standard KO: Knocked out si prix en-dessous de la barrière
                barrierCrossed = realPrice <= barrier;
              } else {
                // Call Standard KO: Knocked out si prix au-dessus de la barrière
                barrierCrossed = realPrice >= barrier;
              }
            }
            
            if (barrierCrossed) {
              isKnockedOut = true;
            }
          }
          
          // Stocker si l'option est knocked out à ce mois
          barrierCrossings[optionId][monthIndex] = isKnockedOut;
        });
      }
      
      // Gestion des options knockin - ajout de code similaire pour suivre l'activation
      if (option.type.includes('knockin')) {
        const optionId = `${option.type}-${optIndex}`;
        barrierActivations[optionId] = [];
        
        const barrier = option.barrierType === 'percent' ? 
          params.spotPrice * (option.barrier / 100) : 
          option.barrier;
          
        const secondBarrier = option.type.includes('double') ? 
          (option.barrierType === 'percent' ? 
            params.spotPrice * (option.secondBarrier / 100) : 
            option.secondBarrier) : 
          undefined;
        
        // Vérifier l'activation pour chaque mois
        let isKnockedIn = false;
        
        months.forEach((date, monthIndex) => {
          const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
          const realPrice = realPrices[monthKey] || 0;
          
          // Vérifier si cette option serait knocked in
          let barrierHit = false;
          if (!isKnockedIn) { // Vérifier seulement si l'option n'est pas déjà knocked in
            if (option.type.includes('reverse')) {
              if (option.type.includes('put')) {
                // Put Reverse KI: Knocked in si prix au-dessus de la barrière
                barrierHit = realPrice >= barrier;
              } else {
                // Call Reverse KI: Knocked in si prix en-dessous de la barrière
                barrierHit = realPrice <= barrier;
              }
            } else if (option.type.includes('double')) {
              // Double KI: Knocked in si prix en dehors des deux barrières
              const upperBarrier = Math.max(barrier, secondBarrier || 0);
              const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
              barrierHit = realPrice >= upperBarrier || realPrice <= lowerBarrier;
            } else {
              if (option.type.includes('put')) {
                // Put Standard KI: Knocked in si prix en-dessous de la barrière
                barrierHit = realPrice <= barrier;
              } else {
                // Call Standard KI: Knocked in si prix au-dessus de la barrière
                barrierHit = realPrice >= barrier;
              }
            }
            
            if (barrierHit) {
              isKnockedIn = true;
            }
          }
          
          // Stocker si l'option est knocked in à ce mois
          barrierActivations[optionId][monthIndex] = isKnockedIn;
        });
      }
    });

    // Generate detailed results for each period with the corresponding monthly volume
    const detailedResults = months.map((date, i) => {
      // Use the monthly volume from our array instead of dividing total volume
      const monthlyVolume = monthlyVolumes[i];
      
      const t = timeToMaturities[i];
      const maturityIndex = monthlyIndices[i]; // Add the maturityIndex definition
      
      // Get forward price
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const forward = (() => {
        const timeDiff = date.getTime() - startDate.getTime();
        return manualForwards[monthKey] || 
          initialSpotPrice * Math.exp(params.interestRate/100 * timeDiff/(1000 * 60 * 60 * 24 * 365));
      })();

      // Get real price
      const realPrice = realPrices[monthKey] || forward;

      // Calculer le prix du swap une fois pour tous les swaps
        const swapPrice = calculateSwapPrice(
            months.map((_, idx) => {
                const monthKey = `${_.getFullYear()}-${_.getMonth() + 1}`;
                return manualForwards[monthKey] || 
            initialSpotPrice * Math.exp(params.interestRate/100 * timeToMaturities[idx]);
            }),
            timeToMaturities,
        params.interestRate/100
        );

      // Séparer les swaps des options
        const swaps = strategy.filter(s => s.type === 'swap');
        const options = strategy.filter(s => s.type !== 'swap');

      // Calculer les prix des options en utilisant les chemins de prix
        const optionPrices = options.map((option, optIndex) => {
            const strike = option.strikeType === 'percent' ? 
          params.spotPrice * (option.strike/100) : 
                option.strike;
            
            // Generate a descriptive label based on option type
            let optionLabel = "";
            if (option.type === 'call') {
              optionLabel = `Call Price ${optIndex + 1}`;
            } else if (option.type === 'put') {
              optionLabel = `Put Price ${optIndex + 1}`;
            } else if (option.type === 'swap') {
              optionLabel = `Swap Price ${optIndex + 1}`;
            } else if (option.type.includes('knockout')) {
              // Knockout options
              if (option.type.includes('call')) {
                if (option.type.includes('reverse')) {
                  optionLabel = `Call Rev KO ${optIndex + 1}`;
                } else if (option.type.includes('double')) {
                  optionLabel = `Call Dbl KO ${optIndex + 1}`;
            } else {
                  optionLabel = `Call KO ${optIndex + 1}`;
                }
              } else { // Put options
                if (option.type.includes('reverse')) {
                  optionLabel = `Put Rev KO ${optIndex + 1}`;
                } else if (option.type.includes('double')) {
                  optionLabel = `Put Dbl KO ${optIndex + 1}`;
                } else {
                  optionLabel = `Put KO ${optIndex + 1}`;
                }
              }
            } else if (option.type.includes('knockin')) {
              // Knockin options
              if (option.type.includes('call')) {
                if (option.type.includes('reverse')) {
                  optionLabel = `Call Rev KI ${optIndex + 1}`;
                } else if (option.type.includes('double')) {
                  optionLabel = `Call Dbl KI ${optIndex + 1}`;
                } else {
                  optionLabel = `Call KI ${optIndex + 1}`;
                }
              } else { // Put options
                if (option.type.includes('reverse')) {
                  optionLabel = `Put Rev KI ${optIndex + 1}`;
                } else if (option.type.includes('double')) {
                  optionLabel = `Put Dbl KI ${optIndex + 1}`;
                } else {
                  optionLabel = `Put KI ${optIndex + 1}`;
                }
              }
            }
            
        // Calculate option price differently based on type
        let price;
        
        // Vérifier si cette option a été knocked out dans un mois précédent
        const optionId = `${option.type}-${optIndex}`;
        const isKnockedOut = option.type.includes('knockout') && barrierCrossings[optionId] && barrierCrossings[optionId][i];
        
        // Pour les options knockout, nous calculons toujours le prix même si l'option est knocked out
        // Le prix représente la valeur théorique de l'option, indépendamment de son état knocked out
        if (option.type === 'call' || option.type === 'put') {
          // Use existing Black-Scholes for vanilla options
          const effectiveSigma = useImpliedVol && impliedVolatilities[monthKey] ? 
            impliedVolatilities[monthKey] / 100 : 
            option.volatility / 100;
            
          // For standard options, use Black-Scholes
          const d1 = (Math.log(forward/strike) + (params.interestRate/100 + effectiveSigma**2/2)*t) / (effectiveSigma*Math.sqrt(t));
          const d2 = d1 - effectiveSigma*Math.sqrt(t);
          
          const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
          const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
          
          if (option.type === 'call') {
            price = forward*Nd1 - strike*Math.exp(-params.interestRate/100*t)*Nd2;
          } else { // put
            price = strike*Math.exp(-params.interestRate/100*t)*(1-Nd2) - forward*(1-Nd1);
          }
        } else if (option.type.includes('knockout') || option.type.includes('knockin')) {
          // For barrier options, use Monte Carlo paths or closed-form solutions based on flag
          const barrier = option.barrierType === 'percent' ? 
            params.spotPrice * (option.barrier / 100) : 
            option.barrier;
            
          const secondBarrier = option.type.includes('double') ? 
            (option.barrierType === 'percent' ? 
              params.spotPrice * (option.secondBarrier / 100) : 
              option.secondBarrier) : 
            undefined;
            
          // Use closed-form solution if enabled and option type is supported
          if (useClosedFormBarrier && !option.type.includes('double') && !option.type.includes('reverse')) {
            price = calculateBarrierOptionClosedForm(
              option.type,
              forward,
              strike,
              params.interestRate/100,
              t,
              option.volatility/100,
              barrier,
              secondBarrier
            );
          } else {
            // Otherwise use Monte Carlo simulation
          price = calculatePricesFromPaths(
                option.type,
                forward,
                    strike,
                params.interestRate/100,
            maturityIndex,
            paths,
            barrier,
            secondBarrier
          );
          }
        }
            
        return {
          type: option.type,
          price: price,
              quantity: option.quantity/100,
              strike: strike,
              label: optionLabel
            };
        });

      // Add swap prices
      const allOptionPrices = [
        ...optionPrices,
        ...swaps.map((swap, swapIndex) => ({
          type: 'swap',
          price: swapPrice,
          quantity: swap.quantity/100,
          strike: swap.strike,
          label: `Swap Price ${swapIndex + 1}`
        }))
      ];

        // Calculate strategy price
      const strategyPrice = allOptionPrices.reduce((total, opt) => 
            total + (opt.price * opt.quantity), 0);

        // Calculate payoff using real price
      const totalPayoff = allOptionPrices.reduce((sum, opt, idx) => {
          let payoff = 0;
          
        // Pour les options de la stratégie originale, utiliser l'index original
        // pour retrouver correctement l'état knock-out/knock-in
        const originalIndex = options.findIndex((original, i) => {
          const originalStrike = original.strikeType === 'percent' ? 
            params.spotPrice * (original.strike/100) : original.strike;
          return original.type === opt.type && Math.abs(originalStrike - opt.strike) < 0.001;
        });
        
        const optionId = `${opt.type}-${originalIndex}`;
        
        // Vérifier si l'option est knocked out (pour toutes les options à barrière)
        const isKnockedOut = opt.type.includes('knockout') && barrierCrossings[optionId] && barrierCrossings[optionId][i];
        // Vérifier si l'option est knocked in (pour toutes les options à barrière knock-in)
        const isKnockedIn = opt.type.includes('knockin') && barrierActivations[optionId] && barrierActivations[optionId][i];
        
        if (isKnockedOut) {
          // Si l'option est knocked out, son payoff est 0
          payoff = 0;
        } else if (opt.type.includes('knockin')) {
          // Pour les options knock-in, utiliser l'état stocké
            const isCall = opt.type.includes('call');
            const basePayoff = isCall ? 
            Math.max(0, realPrice - opt.strike) : 
            Math.max(0, opt.strike - realPrice);
          
          // Si l'option est déjà knocked in, elle est active
          payoff = isKnockedIn ? basePayoff : 0;
        } else if (opt.type.includes('knockout') || opt.type.includes('knockin')) {
          // Pour les options knockout, vérifier si le prix actuel franchirait la barrière
          const option = strategy.find(s => s.type === opt.type);
          if (!option) return sum;
          
          const barrier = option.barrierType === 'percent' ? 
            params.spotPrice * (option.barrier / 100) : 
            option.barrier;
            
          const secondBarrier = option.type.includes('double') ? 
            (option.barrierType === 'percent' ? 
              params.spotPrice * (option.secondBarrier / 100) : 
              option.secondBarrier) : 
            undefined;
          
          // Vérifier si le prix actuel franchirait la barrière
          let barrierHit = false;
          
              if (opt.type.includes('reverse')) {
                if (opt.type.includes('put')) {
              barrierHit = realPrice >= barrier; // Reverse Put: hit if above
                } else {
              barrierHit = realPrice <= barrier; // Reverse Call: hit if below
                }
              } else if (opt.type.includes('double')) {
            barrierHit = realPrice >= barrier || (secondBarrier && realPrice <= secondBarrier);
              } else {
                if (opt.type.includes('put')) {
              barrierHit = realPrice <= barrier; // Put: hit if below
                } else {
              barrierHit = realPrice >= barrier; // Call: hit if above
            }
          }
          
          const isCall = opt.type.includes('call');
          const basePayoff = isCall ? 
            Math.max(0, realPrice - opt.strike) : 
            Math.max(0, opt.strike - realPrice);
          
          if (opt.type.includes('knockout')) {
            payoff = barrierHit ? 0 : basePayoff;
            }
          } else if (opt.type === 'call') {
          payoff = Math.max(0, realPrice - opt.strike);
          } else if (opt.type === 'put') {
          payoff = Math.max(0, opt.strike - realPrice);
          } else if (opt.type === 'swap') {
          payoff = forward - realPrice;
          }
          
            return sum + (payoff * opt.quantity);
        }, 0);

      // Calculer le pourcentage total de swaps dans la stratégie
        const totalSwapPercentage = swaps.reduce((sum, swap) => sum + swap.quantity, 0) / 100;
      
      // Calculer le prix couvert (hedged price) en tenant compte des swaps et du prix réel
        const hedgedPrice = totalSwapPercentage * swapPrice + (1 - totalSwapPercentage) * realPrice;

      // Calculer le coût hedgé selon la formule d'origine
        const hedgedCost = -(monthlyVolume * hedgedPrice) - 
            (monthlyVolume * (1 - totalSwapPercentage) * strategyPrice) + 
            (monthlyVolume * (1 - totalSwapPercentage) * totalPayoff);
      
      // Calculer le coût non hedgé selon la formule d'origine
      const unhedgedCost = -(monthlyVolume * realPrice);
      
      // Calculer le Delta P&L selon la formule d'origine
      const deltaPnL = hedgedCost - unhedgedCost;

        return {
        date: date.toISOString().split('T')[0],
        timeToMaturity: t,
        forward: forward,
        realPrice: realPrice,
        optionPrices: allOptionPrices,
        strategyPrice: strategyPrice,
        totalPayoff: totalPayoff,
        monthlyVolume: monthlyVolume,
        hedgedCost: hedgedCost,
        unhedgedCost: unhedgedCost,
        deltaPnL: deltaPnL
        };
    });

    setResults(detailedResults);
    
    // Après avoir mis à jour toutes les données de résultats, recalculez les simulations Monte Carlo
    // Cette ligne devrait être placée juste avant la fin de la fonction calculateResults
    if (realPriceParams.useSimulation) {
      recalculateMonteCarloSimulations();
    }
  };

  useEffect(() => {
    if (strategy.length > 0) {
      calculatePayoff();
    }
  }, [strategy]);

  // Apply stress test scenario
  const applyStressTest = (key) => {
    setActiveStressTest(key);
    const scenario = stressTestScenarios[key];
    
    // Appliquer le choc de prix au prix spot
    const adjustedPrice = params.spotPrice * (1 + scenario.priceShock);
    
    // Mettre à jour les paramètres de prix réels
    setRealPriceParams(prev => ({
      ...prev,
      useSimulation: !scenario.realBasis, // Désactiver la simulation si on utilise realBasis
      volatility: scenario.volatility,
      drift: scenario.drift
    }));
    
    // Calculer les forward prices et real prices selon le type de scénario
      const newForwards = {};
    const newRealPrices = {};
      
    const months = [];
    const startDate = new Date(params.startDate);
      
      for (let i = 0; i < params.monthsToHedge; i++) {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + i);
      months.push(date);
      
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        const timeInYears = i / 12;
      
      // Calcul du forward price standard basé sur le taux d'intérêt
      const baseForward = params.spotPrice * Math.exp((params.interestRate/100) * timeInYears);
      
      // Pour Contango et Backwardation standard, appliquer la base mensuelle aux forwards
      if (scenario.forwardBasis !== undefined) {
        // Pour Contango: augmentation mensuelle (ex: 1.05^mois)
        // Pour Backwardation: diminution mensuelle (ex: 0.95^mois)
        newForwards[monthKey] = baseForward * Math.pow(1 + scenario.forwardBasis, i);
      } else {
        // Si pas de base spécifiée, utiliser le forward standard
        newForwards[monthKey] = baseForward;
      }
      
      // Pour tous les scénarios, appliquer le choc de prix aux prix réels
    if (scenario.realBasis !== undefined) {
        // Pour Contango (Real Prices) et Backwardation (Real Prices)
        newRealPrices[monthKey] = adjustedPrice * Math.pow(1 + scenario.realBasis, i);
      } else {
        // Pour les autres scénarios, appliquer uniquement le choc de prix
        newRealPrices[monthKey] = adjustedPrice;
      }
    }
    
    if (Object.keys(newForwards).length > 0) {
      setManualForwards(newForwards);
    }
    
    if (Object.keys(newRealPrices).length > 0) {
      setRealPrices(newRealPrices);
    }
    
      calculateResults();
  };

  // Update stress test scenario
  const updateScenario = (key: string, field: keyof StressTestScenario, value: number) => {
    setStressTestScenarios(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: value
      }
    }));
  };

  // Type guard for results
  const isValidResult = (result: any): result is Result => {
    return result && 
      typeof result.hedgedCost === 'number' &&
      typeof result.unhedgedCost === 'number' &&
      typeof result.deltaPnL === 'number' &&
      typeof result.strategyPrice === 'number' &&
      typeof result.monthlyVolume === 'number';
  };

  // Update the yearlyResults calculation with type checking
  const calculateYearlyResults = (results: Result[]) => {
    return results.reduce((acc: Record<string, { 
      hedgedCost: number; 
      unhedgedCost: number; 
      deltaPnL: number;
      strategyPremium: number; // Added this property
    }>, row) => {
      // Corriger l'extraction de l'année - les dates sont maintenant au format ISO (YYYY-MM-DD)
      const year = row.date.split('-')[0];
      if (!acc[year]) {
        acc[year] = {
          hedgedCost: 0,
          unhedgedCost: 0,
          deltaPnL: 0,
          strategyPremium: 0 // Initialize the new property
        };
      }
      if (isValidResult(row)) {
        acc[year].hedgedCost += row.hedgedCost;
        acc[year].unhedgedCost += row.unhedgedCost;
        acc[year].deltaPnL += row.deltaPnL;
        acc[year].strategyPremium += (row.strategyPrice * row.monthlyVolume); // Calculate and add the strategy premium
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
      id: uuidv4(),
      name: `Scenario ${new Date().toLocaleDateString()}`,
      timestamp: Date.now(),
      params,
      strategy,
      results,
      payoffData,
      stressTest: activeStressTest ? stressTestScenarios[activeStressTest] : null,
      useImpliedVol,
      impliedVolatilities,
      manualForwards,
      realPrices,
      customOptionPrices
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
      barrierOptionSimulations,
      useClosedFormBarrier,
      activeTab,
      customScenario,
      stressTestScenarios,
      useImpliedVol,
      impliedVolatilities
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
    barrierOptionSimulations,
    useClosedFormBarrier,
    activeTab,
    customScenario,
    stressTestScenarios,
    useImpliedVol,
    impliedVolatilities
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
      spotPrice: 100,
      useCustomPeriods: false,
      customPeriods: []
    });
    setStrategy([]);
    setResults(null);
    setPayoffData([]);
    setManualForwards({});
    setRealPrices({});
    setRealPriceParams({
      useSimulation: false,
      volatility: 0.3,
      drift: 0,
      numSimulations: 1000
    });
    
    // Réinitialiser les données de volatilité implicite et prix personnalisés
    setUseImpliedVol(false);
    setImpliedVolatilities({});
    setUseCustomOptionPrices(false);
    setCustomOptionPrices({});
    
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
        spotPrice: 100,
        useCustomPeriods: false,
        customPeriods: []
      },
      strategy: [],
      results: null,
      payoffData: [],
      manualForwards: {},
      realPrices: {},
      realPriceParams: {
        useSimulation: false,
        volatility: 0.3,
        drift: 0,
        numSimulations: 1000
      },
      barrierOptionSimulations: 1000,
      useClosedFormBarrier: false,
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
      stressTestScenarios: DEFAULT_SCENARIOS,
      useImpliedVol: false,
      impliedVolatilities: {}
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

    // Define PDF options
    const options = {
      margin: [10, 10, 10, 10],
      autoPaging: 'text'as "text",
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false
      }
    };

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
    
    // Activer automatiquement l'utilisation des volatilités implicites
    if (!useImpliedVol) {
      setUseImpliedVol(true);
    }
    
    // Recalculer les résultats immédiatement avec les nouvelles volatilités implicites
    recalculateResults();
  };

  // Fonction pour calculer le prix du swap (moyenne des forwards actualisés)
  const calculateSwapPrice = (forwards: number[], timeToMaturities: number[], r: number) => {
    const weightedSum = forwards.reduce((sum, forward, i) => {
      return sum + forward * Math.exp(-r * timeToMaturities[i]);
    }, 0);
    return weightedSum / forwards.length;
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

  // Mettre à jour l'interface MonthlyStats pour supporter les volatilités nulles
  interface MonthlyStats {
    month: string;
    avgPrice: number;
    volatility: number | null;
  }

  // Mettre à jour la fonction de nettoyage CSV
  const cleanCSVLine = (line: string) => {
    return line
      .replace(/\r/g, '')
      .replace(/^"|"$/g, '')
      .split(/[,;\t]/); // Accepte plusieurs délimiteurs
  };

  // Ajouter cet état pour suivre le format CSV sélectionné
  const [csvFormat, setCsvFormat] = useState<'english' | 'french'>('english');

  // Modifier la partie du code qui gère l'importation des données historiques
  const importHistoricalData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    
    input.onchange = (e: any) => {
      const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
        try {
          const csv = event.target?.result as string;
          const lines = csv.split('\n');
          
          const newData: HistoricalDataPoint[] = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Diviser par virgule ou point-virgule, en tenant compte des guillemets
            const parts = line.split(',').map(part => part.replace(/"/g, '').trim());
            
            if (parts.length < 2) continue;
            
            let dateStr = parts[0];
            let priceStr = parts[1];
            
            // Traiter le format de date selon le format sélectionné
            let date;
            if (csvFormat === 'french') {
              // Format français DD/MM/YYYY
              const [day, month, year] = dateStr.split('/');
              date = new Date(Number(year), Number(month) - 1, Number(day));
            } else {
              // Format anglais MM/DD/YYYY
              const [month, day, year] = dateStr.split('/');
              date = new Date(Number(year), Number(month) - 1, Number(day));
            }
            
            // Traiter le format de prix selon le format sélectionné
            let price;
            if (csvFormat === 'french') {
              // Format français:
              // - Espace ou point comme séparateur de milliers
              // - Virgule comme séparateur décimal
              priceStr = priceStr
                .replace(/\s/g, '') // Supprimer les espaces (séparateurs de milliers)
                .replace(/\./g, '') // Supprimer les points (séparateurs de milliers alternatifs)
                .replace(',', '.'); // Remplacer la virgule par un point pour la conversion
              price = parseFloat(priceStr);
            } else {
              // Format anglais:
              // - Virgule comme séparateur de milliers
              // - Point comme séparateur décimal
              priceStr = priceStr.replace(/,/g, ''); // Supprimer les virgules (séparateurs de milliers)
              price = parseFloat(priceStr);
            }
            
            if (!isNaN(date.getTime()) && !isNaN(price)) {
              newData.push({
                            date: date.toISOString().split('T')[0],
                price
              });
            }
          }
          
          if (newData.length > 0) {
            // Trier les données par date
            const sortedData = newData.sort((a, b) => a.date.localeCompare(b.date));
        setHistoricalData(sortedData);
        calculateMonthlyStats(sortedData);
            console.log("Imported data:", sortedData); // Pour le débogage
            } else {
            alert('No valid data found in the CSV file. Please make sure to select the correct format (French/English).');
          }
          
        } catch (error) {
          console.error('Error parsing CSV:', error);
          alert('Error parsing the CSV file. Please check the format.');
        }
      };
      
        reader.readAsText(file);
    };
    
    input.click();
    };

  // Ajouter cette fonction pour mettre à jour les prix réels et les IV après le calcul des stats mensuelles
  const updateBacktestValues = (stats: MonthlyStats[]) => {
    const newRealPrices: { [key: string]: number } = {};
    const newImpliedVols: { [key: string]: number } = {};

    // Convertir les statistiques mensuelles en mappings par mois
    stats.forEach(stat => {
      const [year, month] = stat.month.split('-');
      const monthKey = `${year}-${Number(month)}`; // Format: "YYYY-M"
      
      // Utiliser la moyenne comme prix réel
      newRealPrices[monthKey] = stat.avgPrice;
      
      // Utiliser la volatilité historique comme IV (si disponible)
      if (stat.volatility !== null) {
        newImpliedVols[monthKey] = stat.volatility * 100; // Convertir en pourcentage
      }
    });

    // Mettre à jour les états
    setRealPrices(newRealPrices);
    setImpliedVolatilities(newImpliedVols);
    setUseImpliedVol(true); // Activer l'utilisation des IV
    
    // Recalculer les résultats avec les nouvelles valeurs
    calculateResults();
  };

  // Mettre à jour le calcul des statistiques mensuelles
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
      // Moyenne simple : somme des prix divisée par le nombre de prix
        const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        
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

    setMonthlyStats(stats.sort((a, b) => b.month.localeCompare(a.month)));
    
    // Ajouter cet appel
    updateBacktestValues(stats);
  };

  // Mettre à jour l'affichage des tableaux
  {showHistoricalData && (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border p-2 bg-gray-50">Date</th>
            <th className="border p-2 bg-gray-50">Price</th>
          </tr>
        </thead>
        <tbody>
          {historicalData.map((point, index) => (
            <tr key={index}>
              <td className="border p-2">{point.date}</td>
              <td className="border p-2">{point.price.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}

  {showMonthlyStats && monthlyStats.length > 0 && (
    <div className="mt-8">
      <h3 className="text-lg font-semibold mb-4">Monthly Statistics</h3>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border p-2 bg-gray-50">Month</th>
            <th className="border p-2 bg-gray-50">Average Price</th>
            <th className="border p-2 bg-gray-50">Historical Volatility</th>
          </tr>
        </thead>
        <tbody>
          {monthlyStats.map((stat, index) => (
            <tr key={index}>
              <td className="border p-2">{stat.month}</td>
              <td className="border p-2">{stat.avgPrice.toFixed(2)}</td>
              <td className="border p-2">
                {stat.volatility ? `${(stat.volatility * 100).toFixed(2)}%` : 'N/A'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}

  // Add this function
  const addHistoricalDataRow = () => {
    const today = new Date().toISOString().split('T')[0];
    setHistoricalData([...historicalData, { date: today, price: 0 }]);
  };

  // Add this function too since it's used in the UI
  const clearHistoricalData = () => {
    setHistoricalData([]);
    setMonthlyStats([]);
  };

  // Modifier la fonction addCurrentStrategyToMatrix
  const addCurrentStrategyToMatrix = () => {
    if (strategy.length === 0) {
      alert("Veuillez d'abord créer une stratégie");
      return;
    }
    
    // Créer une copie profonde de la stratégie actuelle avec toutes les propriétés
    const strategyCopy = strategy.map(opt => ({
      ...opt,
      // S'assurer que les propriétés spécifiques des options à barrière sont incluses
      barrier: opt.barrier,
      secondBarrier: opt.secondBarrier,
      barrierType: opt.barrierType || 'percent'
    }));
    
    // Créer un nom basé sur les composants
    const strategyName = strategyCopy.map(comp => {
      if (comp.type === 'swap') return 'Swap';
      
      // Traitement des options à barrière
      if (comp.type.includes('knockout') || comp.type.includes('knockin')) {
        let optionName = "";
        
        // Déterminer le type de base (call/put)
        if (comp.type.includes('call')) {
          optionName = "Call";
        } else {
          optionName = "Put";
        }
        
        // Ajouter le type de barrière
        if (comp.type.includes('double')) {
          optionName += " Dbl";
        } else if (comp.type.includes('reverse')) {
          optionName += " Rev";
        }
        
        // Ajouter le mécanisme de barrière
        if (comp.type.includes('knockout')) {
          optionName += " KO";
        } else { // knockin
          optionName += " KI";
        }
        
        return optionName;
      }
      
      // Options standards
      return `${comp.type === 'call' ? 'Call' : 'Put'} Option`;
    }).join('/');
    
    setMatrixStrategies([
      ...matrixStrategies,
      {
        components: strategyCopy,
        coverageRatio: 25, // Par défaut 25%
        name: strategyName
      }
    ]);
  };

  // Modifier la fonction generateRiskMatrix pour ajuster le coût de couverture selon le ratio
  const generateRiskMatrix = () => {
    // Vérifier si nous avons des résultats
    if (!results || results.length === 0) {
      alert("Veuillez d'abord calculer les résultats");
      return;
    }

    // Copier les résultats existants pour les préserver
    const existingResults = [...riskMatrixResults];
    const newResults: RiskMatrixResult[] = [];
    
    // Pour chaque stratégie configurée
    matrixStrategies.forEach(strategyConfig => {
      // Vérifier si cette stratégie existe déjà dans les résultats
      const existingStrategyIndex = existingResults.findIndex(result => 
        result.name === strategyConfig.name && 
        result.coverageRatio === strategyConfig.coverageRatio
      );
      
      // Si la stratégie existe déjà, utiliser les résultats existants
      if (existingStrategyIndex !== -1) {
        newResults.push(existingResults[existingStrategyIndex]);
        return;
      }
      
      // Sinon, calculer de nouveaux résultats pour cette stratégie
      
      // Calculer le coût total de la stratégie en tenant compte du ratio de couverture
      const strategyPremium = results.reduce((sum, row) => {
        // Appliquer le ratio de couverture au coût de la stratégie
        return sum + (row.strategyPrice * row.monthlyVolume * (strategyConfig.coverageRatio / 100));
      }, 0);
      
      const costs: {[key: string]: number} = {};
      const differences: {[key: string]: number} = {};
      
      // Pour chaque intervalle de prix
      priceRanges.forEach(range => {
        const midPrice = (range.min + range.max) / 2;
        let totalPnL = 0;
        
        // Simuler chaque mois avec le prix médian constant
        for (let i = 0; i < params.monthsToHedge; i++) {
        const monthlyVolume = params.totalVolume / params.monthsToHedge;
          const coveredVolume = monthlyVolume * (strategyConfig.coverageRatio/100);
          
          // Utiliser les strategyPrice existants des résultats
          const strategyPrice = results[Math.min(i, results.length-1)].strategyPrice;
          
          // Calculer le payoff pour ce prix médian en utilisant la fonction dédiée
          const totalPayoff = calculateStrategyPayoffAtPrice(strategyConfig.components, midPrice);

          // Calculer les coûts pour ce mois
          const unhedgedCost = -(monthlyVolume * midPrice);
          const hedgedCost = -(monthlyVolume * midPrice) + 
            (coveredVolume * totalPayoff) - 
            (coveredVolume * strategyPrice);
          
          totalPnL += (hedgedCost - unhedgedCost);
        }
        
        // Stocker le P&L total pour cet intervalle
        const rangeKey = `${range.min},${range.max}`;
        differences[rangeKey] = totalPnL;
      });
      
      newResults.push({
        strategy: strategyConfig.components,
        coverageRatio: strategyConfig.coverageRatio,
        costs,
        differences,
        hedgingCost: strategyPremium,
        name: strategyConfig.name
      });
    });
    
    setRiskMatrixResults(newResults);
  };

  // Ajouter cette fonction pour ajouter une stratégie à la matrice
  const addMatrixStrategy = () => {
    if (strategy.length === 0) return;
    
    // Créer une copie profonde de la stratégie actuelle avec toutes les propriétés
    const strategyCopy = strategy.map(opt => ({
      ...opt,
      // S'assurer que les propriétés spécifiques des options à barrière sont incluses
      barrier: opt.barrier,
      secondBarrier: opt.secondBarrier,
      barrierType: opt.barrierType || 'percent'
    }));
    
    // Créer un nom basé sur les composants
    const strategyName = strategyCopy.map(comp => {
      if (comp.type === 'swap') return 'Swap';
      
      // Traitement des options à barrière
      if (comp.type.includes('knockout') || comp.type.includes('knockin')) {
        let optionName = "";
        
        // Déterminer le type de base (call/put)
        if (comp.type.includes('call')) {
          optionName = "Call";
        } else {
          optionName = "Put";
        }
        
        // Ajouter le type de barrière
        if (comp.type.includes('double')) {
          optionName += " Dbl";
        } else if (comp.type.includes('reverse')) {
          optionName += " Rev";
        }
        
        // Ajouter le mécanisme de barrière
        if (comp.type.includes('knockout')) {
          optionName += " KO";
        } else { // knockin
          optionName += " KI";
        }
        
        return optionName;
      }
      
      // Options standards
      return `${comp.type === 'call' ? 'Call' : 'Put'} Option`;
    }).join('/');
    
    setMatrixStrategies([
      ...matrixStrategies,
      {
        components: strategyCopy,
        coverageRatio: 25, // Par défaut 25%
        name: strategyName
      }
    ]);
  };

  // Ajouter cette fonction pour calculer le prix de la stratégie
  const calculateStrategyPrice = (components: StrategyComponent[]) => {
    let totalPrice = 0;
    
    components.forEach(comp => {
      const strike = comp.strikeType === 'percent' 
        ? params.spotPrice * (comp.strike / 100) 
        : comp.strike;
      
      if (comp.type === 'swap') {
        totalPrice += 0; // Un swap n'a pas de prime
      } else {
        const optionPrice = calculateOptionPrice(
          comp.type, 
          params.spotPrice, 
          strike, 
          params.interestRate/100, 
          1, // 1 an comme approximation
          comp.volatility/100
        );
        totalPrice += optionPrice * comp.quantity;
      }
    });
    
    return totalPrice;
  };

  // Ajouter cette fonction pour calculer le payoff à un prix donné
  const calculateStrategyPayoffAtPrice = (components: StrategyComponent[], price: number) => {
    let totalPayoff = 0;
    
    components.forEach(comp => {
      const strike = comp.strikeType === 'percent' 
        ? params.spotPrice * (comp.strike / 100) 
        : comp.strike;
      
      let payoff = 0;
      
      if (comp.type === 'swap') {
        // Pour les swaps, le payoff est la différence entre le prix et le strike
        payoff = (price - strike);
      } else if (comp.type.includes('knockout') || comp.type.includes('knockin')) {
        // Traitement des options à barrière
        const barrier = comp.barrierType === 'percent' 
          ? params.spotPrice * (comp.barrier / 100) 
          : comp.barrier;
        
        const secondBarrier = comp.type.includes('double') 
          ? (comp.barrierType === 'percent' 
            ? params.spotPrice * (comp.secondBarrier / 100) 
            : comp.secondBarrier) 
          : undefined;
          
        // Déterminer si la barrière est franchie
        let isBarrierBroken = false;
        
        if (comp.type.includes('double')) {
          // Options à double barrière
          const upperBarrier = Math.max(barrier, secondBarrier || 0);
          const lowerBarrier = Math.min(barrier, secondBarrier || Infinity);
          isBarrierBroken = price >= upperBarrier || price <= lowerBarrier;
        } else if (comp.type.includes('reverse')) {
          // Options à barrière inversée
          if (comp.type.includes('put')) {
            // Put Reverse: barrière franchie si le prix est au-dessus
            isBarrierBroken = price >= barrier;
          } else {
            // Call Reverse: barrière franchie si le prix est en-dessous
            isBarrierBroken = price <= barrier;
          }
        } else {
          // Options à barrière standard
          if (comp.type.includes('put')) {
            // Put: barrière franchie si le prix est en-dessous
            isBarrierBroken = price <= barrier;
          } else {
            // Call: barrière franchie si le prix est au-dessus
            isBarrierBroken = price >= barrier;
          }
        }
        
        // Calculer le payoff de base
        const isCall = comp.type.includes('call');
        const basePayoff = isCall 
          ? Math.max(0, price - strike) 
          : Math.max(0, strike - price);
        
        // Déterminer le payoff final selon le type d'option
        if (comp.type.includes('knockout')) {
          // Pour les options knock-out, le payoff est nul si la barrière est franchie
          payoff = isBarrierBroken ? 0 : basePayoff;
        } else { // knockin
          // Pour les options knock-in, le payoff est non-nul seulement si la barrière est franchie
          payoff = isBarrierBroken ? basePayoff : 0;
        }
      } else if (comp.type === 'call') {
        // Option call standard
        payoff = Math.max(0, price - strike);
      } else { // put
        // Option put standard
        payoff = Math.max(0, strike - price);
      }
      
      // Ajouter le payoff au total en tenant compte de la quantité
      totalPayoff += payoff * (comp.quantity / 100);
    });
    
    return totalPayoff;
  };

  // Ajouter cette fonction pour supprimer une stratégie
  const removeMatrixStrategy = (index: number) => {
    setMatrixStrategies(matrixStrategies.filter((_, i) => i !== index));
  };

  // Mettre à jour la fonction handleCoverageRatioChange
  const handleCoverageRatioChange = (index: number, value: number) => {
    const updated = [...matrixStrategies];
    updated[index].coverageRatio = value;
    setMatrixStrategies(updated);
  };

  // Ajouter cette fonction pour manipuler les plages de prix
  const updatePriceRange = (index: number, field: keyof PriceRange, value: number) => {
    const updated = [...priceRanges];
    updated[index][field] = value;
    setPriceRanges(updated);
  };

  // Ajouter cette fonction pour déterminer la couleur des cellules
  const getCellColor = (value: number) => {
    if (value > 0) {
      const intensity = Math.min(value / 100, 1); // Scale appropriately
      return `rgba(0, 128, 0, ${intensity * 0.3})`; // Green
    } else {
      const intensity = Math.min(Math.abs(value) / 100, 1);
      return `rgba(255, 0, 0, ${intensity * 0.3})`; // Red
    }
  };

  // Ajouter une fonction pour effacer toutes les stratégies
  const clearAllStrategies = () => {
    setMatrixStrategies([]);
    setRiskMatrixResults([]);
  };

  // Ajouter cette fonction pour sauvegarder la matrice de risque
  const saveRiskMatrix = () => {
    if (riskMatrixResults.length === 0) {
      alert("No risk matrix results to save");
      return;
    }

    const name = prompt("Enter a name for this risk matrix:", "Risk Matrix " + new Date().toLocaleDateString());
    if (!name) return;

    const newMatrix: SavedRiskMatrix = {
      id: uuidv4(),
      name,
      timestamp: Date.now(),
      priceRanges: [...priceRanges],
      strategies: [...matrixStrategies],
      results: [...riskMatrixResults],
    };

    const updatedMatrices = [...savedRiskMatrices, newMatrix];
    setSavedRiskMatrices(updatedMatrices);
    localStorage.setItem('savedRiskMatrices', JSON.stringify(updatedMatrices));

    alert("Risk matrix saved successfully!");
  };

  // Ajouter cette fonction pour exporter la matrice de risque en PDF
  const exportRiskMatrixToPDF = async () => {
    if (riskMatrixResults.length === 0) {
      alert("No risk matrix results to export");
      return;
    }

    try {
      // Créer un élément temporaire pour le contenu du PDF
      const tempDiv = document.createElement('div');
      tempDiv.className = 'p-8 bg-white';
      tempDiv.innerHTML = `
        <h1 class="text-2xl font-bold mb-4">Risk Matrix Results</h1>
        <div class="mb-4">
          <h2 class="text-lg font-semibold">Price Ranges</h2>
          <ul>
            ${priceRanges.map(range => `
              <li>Range: [${range.min}, ${range.max}] - Probability: ${range.probability}%</li>
            `).join('')}
          </ul>
        </div>
      `;

      // Créer la table des résultats
      const table = document.createElement('table');
      table.className = 'w-full border-collapse';
      table.innerHTML = `
        <thead>
          <tr>
            <th class="border p-2 text-left">Stratégie</th>
            <th class="border p-2 text-center">Ratio de couverture</th>
            <th class="border p-2 text-center">Coût de la couverture (M$)</th>
            ${priceRanges.map(range => `
              <th class="border p-2 text-center">${range.probability}%<br>[${range.min},${range.max}]</th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${riskMatrixResults.map(result => `
            <tr>
              <td class="border p-2">
                ${result.name}
              </td>
              <td class="border p-2 text-center">${result.coverageRatio}%</td>
              <td class="border p-2 text-center">${(result.hedgingCost / 1000000).toFixed(1)}</td>
              ${priceRanges.map(range => {
                const rangeKey = `${range.min},${range.max}`;
                const value = (result.differences[rangeKey] / 1000000).toFixed(1);
                const color = result.differences[rangeKey] > 0 
                  ? 'rgba(0, 128, 0, 0.2)' 
                  : 'rgba(255, 0, 0, 0.2)';
                return `<td class="border p-2 text-center" style="background-color: ${color}">${value}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      `;
      
      tempDiv.appendChild(table);
      document.body.appendChild(tempDiv);

      // Générer le PDF
      const pdf = new jsPDF('landscape', 'pt', 'a4');
      
      // Utiliser html2canvas pour rendre la table en image
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        useCORS: true,
        logging: false
      });
      
      const imgData = canvas.toDataURL('image/png');
      const imgWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
      
      // Télécharger le PDF
      pdf.save('risk_matrix_results.pdf');
      
      // Nettoyer
      document.body.removeChild(tempDiv);
      
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF. Please try again.");
    }
  };

  // Ajouter cette fonction pour calculer la valeur attendue de chaque stratégie
  const calculateExpectedValue = (result: RiskMatrixResult) => {
    let expectedValue = 0;
    let totalProbability = 0;
    
    // Parcourir chaque plage de prix
    priceRanges.forEach(range => {
      const rangeKey = `${range.min},${range.max}`;
      const difference = result.differences[rangeKey]; // Profit/Perte dans cet intervalle
      const probability = range.probability / 100; // Convertir le pourcentage en décimal
      
      // Ajouter la contribution pondérée de cette plage à la valeur attendue
      expectedValue += difference * probability;
      totalProbability += probability;
    });
    
    // Normaliser si les probabilités ne somment pas exactement à 1
    if (totalProbability !== 1) {
      expectedValue = expectedValue / totalProbability;
    }
    
    return expectedValue;
  };

  // Ajouter une fonction pour sauvegarder les résultats du backtest historique
  const saveHistoricalBacktestResults = () => {
    if (!results) {
      alert("Pas de résultats à sauvegarder. Veuillez d'abord exécuter le backtest.");
      return;
    }

    // Demander à l'utilisateur de nommer son scénario
    const scenarioName = prompt("Nom du scénario:", "Historical Backtest " + new Date().toLocaleDateString());
    if (!scenarioName) return;

    // Créer un nouvel objet scénario
    const newScenario: SavedScenario = {
      id: uuidv4(),
      name: scenarioName,
      timestamp: Date.now(),
      params: {...params},
      strategy: [...strategy],
      results: [...results],
      payoffData: [...payoffData],
      // Indiquer que c'est un backtest historique
      stressTest: {
        name: "Historical Backtest",
        description: "Calculated from historical data",
        volatility: 0,  // Ces valeurs ne sont pas utilisées dans le backtest historique
        drift: 0,       // mais sont nécessaires pour la structure
        priceShock: 0,
        isHistorical: true,  // Marquer comme backtest historique
        historicalData: [...historicalData]  // Ajouter les données historiques
      },
      useImpliedVol,
      impliedVolatilities,
      manualForwards,
      realPrices,
      customOptionPrices
    };

    // Récupérer les scénarios existants
    const savedScenariosStr = localStorage.getItem('optionScenarios');
    const savedScenarios: SavedScenario[] = savedScenariosStr 
      ? JSON.parse(savedScenariosStr) 
      : [];
    
    // Ajouter le nouveau scénario
    savedScenarios.push(newScenario);
    
    // Sauvegarder dans localStorage
    localStorage.setItem('optionScenarios', JSON.stringify(savedScenarios));
    
    alert("Scénario sauvegardé avec succès!");
  };

  // Ajouter une fonction pour exporter les résultats du backtest historique en PDF
  const exportHistoricalBacktestToPDF = () => {
    if (!results) {
      alert("Pas de résultats à exporter. Veuillez d'abord exécuter le backtest.");
      return;
    }

    // Configurer jsPDF
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Define options for PDF export
    const options = {
      margin: [10, 10, 10, 10],
      autoPaging: 'text',
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false
      }
    };
    
    // Titre
    doc.setFontSize(18);
    doc.text('Historical Backtest Results', pageWidth / 2, 15, { align: 'center' });
    
    // Date
    doc.setFontSize(12);
    doc.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, 25, { align: 'center' });
    
    // Paramètres de base
    doc.setFontSize(14);
    doc.text('Basic Parameters', 10, 35);
    doc.setFontSize(10);
    doc.text(`Start Date: ${params.startDate}`, 15, 45);
    doc.text(`Months to Hedge: ${params.monthsToHedge}`, 15, 50);
    doc.text(`Interest Rate: ${params.interestRate}%`, 15, 55);
    doc.text(`Total Volume: ${params.totalVolume}`, 15, 60);
    doc.text(`Spot Price: ${params.spotPrice}`, 15, 65);
    
    // Stratégie
    doc.setFontSize(14);
    doc.text('Strategy Components', 10, 75);
    strategy.forEach((comp, index) => {
      const yPos = 85 + (index * 10);
      const strike = comp.strikeType === 'percent' 
        ? `${comp.strike}%` 
        : comp.strike.toString();
      doc.setFontSize(10);
      doc.text(`Component ${index+1}: ${comp.type.toUpperCase()}, Strike: ${strike}, Vol: ${comp.volatility}%, Qty: ${comp.quantity}%`, 15, yPos);
    });
    
    // Historical Data Summary
    doc.setFontSize(14);
    doc.text('Historical Data Summary', 10, 120);
    doc.setFontSize(10);
    doc.text(`Number of Data Points: ${historicalData.length}`, 15, 130);
    if (monthlyStats.length > 0) {
      doc.text(`Average Historical Volatility: ${
        monthlyStats.reduce((sum, stat) => sum + (stat.volatility || 0), 0) / 
        monthlyStats.filter(stat => stat.volatility !== null).length * 100
      }%`, 15, 135);
    }
    
    // Résultats totaux
    const totalHedgedCost = results.reduce((sum, row) => sum + row.hedgedCost, 0);
    const totalUnhedgedCost = results.reduce((sum, row) => sum + row.unhedgedCost, 0);
    const totalPnL = results.reduce((sum, row) => sum + row.deltaPnL, 0);
    const costReduction = (totalPnL / Math.abs(totalUnhedgedCost)) * 100;
    
    doc.setFontSize(14);
    doc.text('Total Results', 10, 150);
    doc.setFontSize(10);
    doc.text(`Total Cost with Hedging: ${totalHedgedCost.toFixed(2)}`, 15, 160);
    doc.text(`Total Cost without Hedging: ${totalUnhedgedCost.toFixed(2)}`, 15, 165);
    doc.text(`Total P&L: ${totalPnL.toFixed(2)}`, 15, 170);
    doc.text(`Cost Reduction: ${costReduction.toFixed(2)}%`, 15, 175);
    
    // Capturer le graphique P&L et l'ajouter
    const pnlChartContainer = document.getElementById('historical-backtest-pnl-chart');
    if (pnlChartContainer) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text('P&L Evolution', 10, 15);
      
      html2canvas(pnlChartContainer, {
        ...options,
        html2canvas: {
          ...options.html2canvas,
          scale: 2,
          useCORS: true,
          logging: false,
          letterRendering: true,
          allowTaint: true
        }
      }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 10, 25, 190, 100);
        
        // Sauvegarder le PDF
        doc.save('Historical_Backtest_Results.pdf');
      });
    } else {
      doc.save('Historical_Backtest_Results.pdf');
    }
  };

  // Ajouter cette fonction après clearAllStrategies
  const generateGeneralRiskAnalysis = () => {
    // Vérifier si nous avons des résultats
    if (!results || results.length === 0) {
      alert("Veuillez d'abord calculer les résultats");
      return;
    }
    
    // Vérifier qu'il y a au moins une stratégie
    if (matrixStrategies.length === 0) {
      alert("Veuillez d'abord ajouter au moins une stratégie à la matrice");
      return;
    }

    // Sauvegarder les stratégies existantes
    const existingStrategies = [...matrixStrategies];
    
    // Préparer les ratios à appliquer
    const coverageRatios = [25, 50, 75, 100];
    const analysisStrategies = [];
    
    // Pour chaque stratégie existante, créer des versions avec différents ratios
    existingStrategies.forEach(strategy => {
      // Le nom de base de la stratégie 
      const baseName = strategy.name.replace(/\s\d+%$/, ''); // Retirer le % s'il existe déjà
      
      // Créer 4 versions avec différents ratios
      coverageRatios.forEach(ratio => {
        analysisStrategies.push({
          name: `${baseName} ${ratio}%`,
          components: [...strategy.components],
          coverageRatio: ratio
        });
      });
    });
    
    // Définir les stratégies pour la matrice
    setMatrixStrategies(analysisStrategies);
    
    // Générer la matrice avec ces stratégies
    setTimeout(() => {
      generateRiskMatrix();
    }, 100);
  };

  // Ajouter un état pour suivre si l'affichage est en mode variations
  const [showCoverageVariations, setShowCoverageVariations] = useState(false);

  // Ajouter la fonction pour réorganiser l'affichage de la matrice
  const toggleCoverageVariations = () => {
    if (!riskMatrixResults.length) {
      alert("Veuillez d'abord générer la matrice de risque");
      return;
    }
    
    setShowCoverageVariations(!showCoverageVariations);
  };

  // Modifier l'affichage du tableau de la matrice de risque
  {riskMatrixResults.length > 0 && (
    <div className="mt-8 overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4">Risk Matrix Results</h3>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="border p-2">Strategy</th>
            <th className="border p-2">Coverage Ratio</th>
            <th className="border p-2">Hedging Cost (k$)</th>
            {priceRanges.map((range, i) => (
              <th key={i} className="border p-2">{range.probability}%<br/>[{range.min},{range.max}]</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {showCoverageVariations 
            ? riskMatrixResults.flatMap((result, i) => {
                const strategyName = result.name.replace(/\s\d+%$/, '');
                const ratios = [25, 50, 75, 100];
                
                return ratios.map((ratio) => (
                  <tr key={`${i}-${ratio}`}>
                    <td className="border p-2">{strategyName}</td>
                    <td className="border p-2">{ratio}%</td>
                    <td className="border p-2">{((result.hedgingCost / result.coverageRatio) * ratio / 1000).toFixed(1)}</td>
                    
                    {priceRanges.map((range, j) => {
                      const rangeKey = `${range.min},${range.max}`;
                      // Ajuster la valeur en fonction du ratio
                      const adjustedValue = (result.differences[rangeKey] / result.coverageRatio) * ratio;
                      
                      return (
                        <td 
                          key={j} 
                          className="border p-2"
                          style={{ backgroundColor: getCellColor(adjustedValue) }}
                        >
                          {(adjustedValue / 1000).toFixed(1)}
                        </td>
                      );
                    })}
                  </tr>
                ));
              })
            : riskMatrixResults.map((result, i) => (
                <tr key={i}>
                  <td className="border p-2">{result.name}</td>
                  <td className="border p-2">{result.coverageRatio}%</td>
                  <td className="border p-2">{(result.hedgingCost / 1000).toFixed(1)}</td>
                  
                  {priceRanges.map((range, j) => {
                    const rangeKey = `${range.min},${range.max}`;
                    return (
                      <td 
                        key={j} 
                        className="border p-2"
                        style={{ backgroundColor: getCellColor(result.differences[rangeKey]) }}
                      >
                        {(result.differences[rangeKey] / 1000).toFixed(1)}
                      </td>
                    );
                  })}
                </tr>
              ))
          }
        </tbody>
      </table>
    </div>
  )}

  // Add this near the other state variables
  const [showMonteCarloVisualization, setShowMonteCarloVisualization] = useState<boolean>(false);
  
  // Generate months and startDate for simulations
  const startDate = new Date(params.startDate);
  const months = Array.from({ length: params.monthsToHedge }, (_, i) => {
    const date = new Date(startDate);
    date.setMonth(date.getMonth() + i + 1);
    return date;
  });
  
  // Store simulation data
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [isRunningSimulation, setIsRunningSimulation] = useState<boolean>(false);

  // Ajoutez cette fonction pour recalculer les simulations Monte Carlo lorsque les paramètres changent
  const recalculateMonteCarloSimulations = useCallback(() => {
    if (!results) return;
    
    setIsRunningSimulation(true);

    // Récupérer les mois et date de début pour les simulations
    const startDate = new Date(params.startDate);
    let months = [];
    
    // Check if using custom periods
    if (params.useCustomPeriods && params.customPeriods.length > 0) {
      // Sort custom periods by maturity date
      const sortedPeriods = [...params.customPeriods].sort(
        (a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime()
      );
      
      // Use the maturity dates from custom periods
      months = sortedPeriods.map(period => new Date(period.maturityDate));
    } else {
      // Use the standard month generation logic
    let currentDate = new Date(startDate);

    const lastDayOfStartMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const remainingDaysInMonth = lastDayOfStartMonth.getDate() - currentDate.getDate() + 1;

    if (remainingDaysInMonth > 0) {
      months.push(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
    }

    for (let i = 0; i < params.monthsToHedge - (remainingDaysInMonth > 0 ? 1 : 0); i++) {
      currentDate.setMonth(currentDate.getMonth() + 1);
      months.push(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0));
      }
    }

    // Générer les chemins de prix pour toute la période seulement si la simulation est activée
    let paths = [];
    let monthlyIndices = [];
    let timeLabels = [];
    let realPricePaths = [];
    
    // Générer des chemins de prix seulement si la simulation est activée
    if (realPriceParams.useSimulation) {
      const pathsData = generatePricePathsForPeriod(months, startDate, realPriceParams.numSimulations);
      paths = pathsData.paths;
      monthlyIndices = pathsData.monthlyIndices;
      
      // Préparer les données de visualisation Monte Carlo
      timeLabels = months.map(
        (date) => `${date.getFullYear()}-${date.getMonth() + 1}`
      );

      // Sélectionner aléatoirement jusqu'à 100 chemins à afficher
      const maxDisplayPaths = Math.min(100, paths.length);
      const selectedPathIndices = [];
      
      // Si nous avons moins de 100 chemins, utilisez-les tous
      if (paths.length <= maxDisplayPaths) {
        for (let i = 0; i < paths.length; i++) {
          selectedPathIndices.push(i);
        }
      } else {
        // Sinon, sélectionnez 100 indices aléatoires
        while (selectedPathIndices.length < maxDisplayPaths) {
          const randomIndex = Math.floor(Math.random() * paths.length);
          if (!selectedPathIndices.includes(randomIndex)) {
            selectedPathIndices.push(randomIndex);
          }
        }
      }
      
      // Créer les données de chemins de prix réels
      realPricePaths = selectedPathIndices.map(pathIndex => 
        monthlyIndices.map(idx => paths[pathIndex][idx])
      );
    } else {
      // Si la simulation n'est pas utilisée, nous avons quand même besoin de timeLabels pour les options à barrière
      timeLabels = months.map(
        (date) => `${date.getFullYear()}-${date.getMonth() + 1}`
      );
      
      // Générer des chemins simples pour les options barrière si nécessaire
      // Même si useSimulation est false, nous voulons générer des chemins pour les options à barrière
      const pathsData = generatePricePathsForPeriod(months, startDate, 100); // Utiliser seulement 100 simulations pour les options barrière
      paths = pathsData.paths;
      monthlyIndices = pathsData.monthlyIndices;
    }

    // Calculer les prix des options à barrière si nous en avons, même si useSimulation est false
    const barrierOptions = strategy.filter(
      (opt) => opt.type.includes('knockout') || opt.type.includes('knockin')
    );

    const barrierOptionPricePaths: number[][] = [];

    if (barrierOptions.length > 0) {
      // Génération de chemins spécifiques pour les options à barrière
      const barrierPathsData = generatePricePathsForPeriod(months, startDate, barrierOptionSimulations);
      const barrierPaths = barrierPathsData.paths;
      const barrierMonthlyIndices = barrierPathsData.monthlyIndices;
      
      // Sélectionner les chemins à utiliser pour l'affichage (soit tous si peu nombreux, soit un échantillon aléatoire)
      const maxDisplayPaths = Math.min(100, barrierPaths.length);
      const selectedPathIndices = [];
      
      // Si nous avons moins de 100 chemins, utilisez-les tous
      if (barrierPaths.length <= maxDisplayPaths) {
        for (let i = 0; i < barrierPaths.length; i++) {
          selectedPathIndices.push(i);
        }
      } else {
        // Sinon, sélectionnez 100 indices aléatoires
        while (selectedPathIndices.length < maxDisplayPaths) {
          const randomIndex = Math.floor(Math.random() * barrierPaths.length);
          if (!selectedPathIndices.includes(randomIndex)) {
            selectedPathIndices.push(randomIndex);
          }
        }
      }

      // Pour simplifier, utilisez la première option à barrière
      const barrierOption = barrierOptions[0];
      
      // Calculer la valeur de la barrière
      const barrier = barrierOption.barrierType === 'percent' 
        ? params.spotPrice * (barrierOption.barrier! / 100) 
        : barrierOption.barrier!;
      
      const secondBarrier = barrierOption.type.includes('double')
        ? barrierOption.barrierType === 'percent'
          ? params.spotPrice * (barrierOption.secondBarrier! / 100)
          : barrierOption.secondBarrier
        : undefined;
        
      // Calculer le strike
      const strike = barrierOption.strikeType === 'percent'
        ? params.spotPrice * (barrierOption.strike / 100)
        : barrierOption.strike;

      // Calculer les prix des options pour les chemins sélectionnés
      for (const pathIndex of selectedPathIndices) {
        const path = barrierPaths[pathIndex];
        const optionPrices: number[] = [];
        
        // Pour chaque mois, calculer le prix de l'option
        for (let monthIdx = 0; monthIdx < barrierMonthlyIndices.length; monthIdx++) {
          const maturityIndex = barrierMonthlyIndices[monthIdx];
          
          // Calculer le prix de l'option à ce point
          const optionPrice = calculatePricesFromPaths(
            barrierOption.type,
            params.spotPrice,
            strike,
            params.interestRate/100,
            maturityIndex,
            [path],
            barrier,
            secondBarrier
          );
          
          optionPrices.push(optionPrice);
        }
        
        barrierOptionPricePaths.push(optionPrices);
      }
    }

    // Mettre à jour les données de visualisation avec les chemins calculés
    setSimulationData({
      realPricePaths,
      timeLabels,
      strategyName: barrierOptions.length > 0 
        ? `${barrierOptions[0].type} at ${barrierOptions[0].strike}` 
        : 'Current Strategy',
    });

    setIsRunningSimulation(false);
  }, [params, realPriceParams.numSimulations, strategy, results, barrierOptionSimulations]);

  // Update the realPriceParams and recalculate when numSimulations changes
  const handleNumSimulationsChange = (value: number) => {
    // Ensure value is between 100 and 5000
    const validValue = Math.max(100, Math.min(5000, value));
    
    setRealPriceParams(prev => ({
      ...prev,
      numSimulations: validValue
    }));
    
    // Recalculer les simulations avec le nouveau nombre de simulations
    if (results && realPriceParams.useSimulation) {
      recalculateMonteCarloSimulations();
    }
  };

  // Mise à jour du nombre de simulations pour les options à barrière
  useEffect(() => {
    if (results && strategy.some(opt => opt.type.includes('knockout') || opt.type.includes('knockin'))) {
      recalculateMonteCarloSimulations();
    }
  }, [barrierOptionSimulations, recalculateMonteCarloSimulations, results, strategy]);

  // Ajouter un effet useEffect pour recalculer les simulations Monte Carlo lorsque useSimulation change
  useEffect(() => {
    if (results) {
      recalculateMonteCarloSimulations();
    }
  }, [realPriceParams.useSimulation, recalculateMonteCarloSimulations, results]);
  
  // Function to add a new custom period
  const addCustomPeriod = () => {
    // Calculate a default maturity date one month from the start date
    const startDate = new Date(params.startDate);
    startDate.setMonth(startDate.getMonth() + params.customPeriods.length + 1);
    
    // Create a new custom period with default values
    const newPeriod: CustomPeriod = {
      maturityDate: startDate.toISOString().split('T')[0],
      volume: Math.round(params.totalVolume / (params.customPeriods.length + 1))
    };
    
    // Update the params with the new period
    setParams({
      ...params,
      customPeriods: [...params.customPeriods, newPeriod]
    });
  };
  
  // Function to remove a custom period
  const removeCustomPeriod = (index: number) => {
    const updatedPeriods = [...params.customPeriods];
    updatedPeriods.splice(index, 1);
    
    setParams({
      ...params,
      customPeriods: updatedPeriods
    });
  };
  
  // Function to update a custom period
  const updateCustomPeriod = (index: number, field: keyof CustomPeriod, value: string | number) => {
    const updatedPeriods = [...params.customPeriods];
    updatedPeriods[index] = {
      ...updatedPeriods[index],
      [field]: value
    };
    
    setParams({
      ...params,
      customPeriods: updatedPeriods
    });
  };
  
  // Function to toggle between using standard months or custom periods
  const toggleCustomPeriods = () => {
    // If switching to custom periods for the first time, initialize with one period
    if (!params.useCustomPeriods && params.customPeriods.length === 0) {
      const startDate = new Date(params.startDate);
      startDate.setMonth(startDate.getMonth() + 1);
      
      setParams({
        ...params,
        useCustomPeriods: !params.useCustomPeriods,
        customPeriods: [
          {
            maturityDate: startDate.toISOString().split('T')[0],
            volume: params.totalVolume
          }
        ]
      });
    } else {
      setParams({
        ...params,
        useCustomPeriods: !params.useCustomPeriods
      });
    }
    
    // Recalculate results if they exist
    if (results) {
      recalculateResults();
    }
  };

  // Fonction pour calculer le prix des options à barrière avec formules fermées
  const calculateBarrierOptionClosedForm = (
    optionType: string,
    S: number,      // Current price
    K: number,      // Strike price
    r: number,      // Risk-free rate
    t: number,      // Time to maturity in years
    sigma: number,  // Volatility
    barrier: number, // Barrier level
    secondBarrier?: number // Second barrier for double barrier options
  ) => {
    // Paramètres fondamentaux selon les notations standards
    const b = r;                          // Cost of carry (peut être ajusté pour dividendes)
    const mu = (b - sigma * sigma / 2) / (sigma * sigma);  // Drift parameter
    const lambda = Math.sqrt(mu * mu + 2 * r / (sigma * sigma)); // Lambda parameter
    
    // Fonction pour calculer N(x) - fonction de répartition de la loi normale centrée réduite
    const N = (x) => (1 + erf(x / Math.sqrt(2))) / 2;
    
    // Calcul des termes récurrents dans les formules
    const phi = (x, y) => {
      if (y <= 0) {
        return 0;
      }
      return Math.exp(-2 * Math.log(S / barrier) * Math.log(barrier / y) / (sigma * sigma * t)) * N(x - 2 * Math.log(S / barrier) / (sigma * Math.sqrt(t)));
    };
    
    // Base de la formule de Black-Scholes
    const d1 = (Math.log(S / K) + (b + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
    const d2 = d1 - sigma * Math.sqrt(t);
    
    // Termes spécifiques aux options à barrière
    const e1 = (Math.log(S / barrier) + (b + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
    const e2 = e1 - sigma * Math.sqrt(t);
    
    const f1 = (Math.log(barrier / S) + (b + sigma * sigma / 2) * t) / (sigma * Math.sqrt(t));
    const f2 = f1 - sigma * Math.sqrt(t);
    
    // Paramètres pour l'effet de barrière
    const eta = (optionType.includes('call')) ? 1 : -1;  // +1 pour call, -1 pour put
    const phi_factor = Math.pow(barrier / S, 2 * mu);
    
    let optionPrice = 0;
    
    // Formules spécifiques selon Haug (2007) "The Complete Guide to Option Pricing Formulas"
    
    // Down-and-out call (S > B et B < K)
    if (optionType === 'call-knockout' && !optionType.includes('reverse') && barrier < S && barrier < K) {
      optionPrice = S * N(d1) - K * Math.exp(-r * t) * N(d2) - 
             S * phi_factor * (N(-e1) - N(-f1)) + 
             K * Math.exp(-r * t) * phi_factor * (N(-e2) - N(-f2));
    }
    
    // Up-and-out call (S < B et B > K)
    else if (optionType === 'call-knockout' && !optionType.includes('reverse') && barrier > S && barrier > K) {
      optionPrice = S * N(d1) - K * Math.exp(-r * t) * N(d2) - 
             S * phi_factor * N(e1) + 
             K * Math.exp(-r * t) * phi_factor * N(e2);
    }
    
    // Down-and-out put (S > B et B < K)
    else if (optionType === 'put-knockout' && !optionType.includes('reverse') && barrier < S && barrier < K) {
      optionPrice = K * Math.exp(-r * t) * N(-d2) - S * N(-d1) - 
             (K * Math.exp(-r * t) * phi_factor * N(-e2) - 
              S * phi_factor * N(-e1));
    }
    
    // Up-and-out put (S < B et B > K)
    else if (optionType === 'put-knockout' && !optionType.includes('reverse') && barrier > S && barrier > K) {
      optionPrice = K * Math.exp(-r * t) * N(-d2) - S * N(-d1) - 
             (K * Math.exp(-r * t) * phi_factor * (N(f2) - N(e2)) - 
              S * phi_factor * (N(f1) - N(e1)));
    }
    
    // Reverse knock-out call: s'active quand le sous-jacent descend en-dessous de la barrière
    else if (optionType === 'call-reverse-knockout') {
      // Pour ce type d'option, la barrière est généralement inférieure au prix du sous-jacent
      if (barrier < S) {
        optionPrice = S * N(d1) - K * Math.exp(-r * t) * N(d2) -
               S * phi_factor * N(-e1) + 
               K * Math.exp(-r * t) * phi_factor * N(-e2);
      }
    }
    
    // Reverse knock-out put: s'active quand le sous-jacent monte au-dessus de la barrière
    else if (optionType === 'put-reverse-knockout') {
      // Pour ce type d'option, la barrière est généralement supérieure au prix du sous-jacent
      if (barrier > S) {
        optionPrice = K * Math.exp(-r * t) * N(-d2) - S * N(-d1) -
               (K * Math.exp(-r * t) * phi_factor * (-N(f2) + N(e2)) - 
                S * phi_factor * (-N(f1) + N(e1)));
      }
    }
    
    // Pour les options knock-in, utiliser la parité knock-in + knock-out = vanille
    else if (optionType.includes('knockin')) {
      // Calcul du prix de l'option vanille correspondante (Black-Scholes standard)
      let vanillaPrice;
      if (optionType.includes('call')) {
        vanillaPrice = S * N(d1) - K * Math.exp(-r * t) * N(d2);
      } else { // put
        vanillaPrice = K * Math.exp(-r * t) * N(-d2) - S * N(-d1);
      }
      
      // Type correspondant pour l'option knock-out
      const koType = optionType.replace('knockin', 'knockout');
      
      // Appliquer la relation de parité
      const knockoutPrice = calculateBarrierOptionClosedForm(koType, S, K, r, t, sigma, barrier);
      optionPrice = vanillaPrice - knockoutPrice;
    }
    
    // Pour les cas non couverts par les formules (options à double barrière, barrières inversées, etc.)
    // Utiliser la simulation Monte Carlo
    else {
      optionPrice = calculateBarrierOptionPrice(optionType, S, K, r, t, sigma, barrier, secondBarrier, barrierOptionSimulations);
    }
    
    // S'assurer que le prix de l'option n'est jamais négatif
    return Math.max(0, optionPrice);
  };

  const [barrierValue, setBarrierValue] = useState<number | null>(null);
  const [secondBarrierValue, setSecondBarrierValue] = useState<number | null>(null);

  // Fonction pour calculer la volatilité implicite à partir d'un prix d'option observé
  const calculateImpliedVolatility = (
    optionType: string,
    S: number,      // Prix actuel du sous-jacent
    K: number,      // Prix d'exercice
    r: number,      // Taux sans risque
    t: number,      // Temps jusqu'à maturité en années
    observedPrice: number,  // Prix de l'option observé sur le marché
    epsilon: number = 0.0001, // Précision souhaitée
    maxIterations: number = 100 // Nombre maximum d'itérations
  ): number => {
    // Pour les options à barrière ou complexes, cette fonction est plus difficile à implémenter
    // Dans ce cas, nous nous limitons aux calls et puts vanille
    if (optionType !== 'call' && optionType !== 'put') {
      return 0; // Retourner une valeur par défaut pour les options non supportées
    }

    // Méthode de Newton-Raphson pour trouver la volatilité implicite
    let sigma = 0.20; // Valeur initiale
    let vega = 0;
    let price = 0;
    let diff = 0;
    let iteration = 0;

    while (iteration < maxIterations) {
      // Calcul du prix avec la volatilité courante
      const d1 = (Math.log(S/K) + (r + sigma*sigma/2)*t) / (sigma*Math.sqrt(t));
      const d2 = d1 - sigma*Math.sqrt(t);
      
      const Nd1 = (1 + erf(d1/Math.sqrt(2)))/2;
      const Nd2 = (1 + erf(d2/Math.sqrt(2)))/2;
      
      if (optionType === 'call') {
        price = S*Nd1 - K*Math.exp(-r*t)*Nd2;
      } else { // put
        price = K*Math.exp(-r*t)*(1-Nd2) - S*(1-Nd1);
      }
      
      // Différence entre le prix calculé et le prix observé
      diff = price - observedPrice;
      
      // Vérifier si la précision souhaitée est atteinte
      if (Math.abs(diff) < epsilon) {
        break;
      }
      
      // Calcul de la vega (dérivée du prix par rapport à la volatilité)
      vega = S * Math.sqrt(t) * (1/Math.sqrt(2*Math.PI)) * Math.exp(-d1*d1/2);
      
      // Mise à jour de sigma selon la méthode de Newton-Raphson
      sigma = sigma - diff / vega;
      
      // Empêcher sigma de devenir négatif ou trop petit
      if (sigma <= 0.001) {
        sigma = 0.001;
      }
      
      // Empêcher sigma de devenir trop grand
      if (sigma > 1) {
        sigma = 1;
      }
      
      iteration++;
    }
    
    // Retourner la volatilité implicite en pourcentage
    return sigma * 100;
  };

  // Gestionnaire d'événements pour mettre à jour le prix personnalisé et calculer l'IV correspondante
  const handleCustomPriceChange = (monthKey: string, optionIndex: string, newPrice: number) => {
    // Mettre à jour l'état des prix personnalisés
    setCustomOptionPrices(prev => {
      const updated = { ...prev };
      if (!updated[monthKey]) {
        updated[monthKey] = {};
      }
      updated[monthKey][optionIndex] = newPrice;
      return updated;
    });
    
    // Si nous avons des résultats
    if (results) {
      const monthResult = results.find(r => {
        const date = new Date(r.date);
        return `${date.getFullYear()}-${date.getMonth() + 1}` === monthKey;
      });
      
      if (monthResult) {
        // Trouver l'option correspondante
        const optionType = optionIndex.split('-')[0]; // Extraire le type (call, put, etc.)
        const optionIdx = parseInt(optionIndex.split('-')[1] || '0'); // Extraire l'index numérique
        
        const option = monthResult.optionPrices.find((opt, idx) => 
          opt.type === optionType && idx === optionIdx
        );
        
        if (option) {
          // Pour les options standards (call/put)
          if (option.type === 'call' || option.type === 'put') {
            // Calculer la volatilité implicite à partir du prix personnalisé
            const impliedVol = calculateImpliedVolatility(
              option.type,
              monthResult.forward,  // Utiliser le prix forward comme S
              option.strike,        // Prix d'exercice
              params.interestRate / 100, // Taux sans risque (conversion en décimal)
              monthResult.timeToMaturity, // Temps jusqu'à maturité
              newPrice              // Prix observé de l'option
            );
            
            // Mettre à jour la volatilité implicite pour ce mois
            setImpliedVolatilities(prev => ({
              ...prev,
              [monthKey]: impliedVol
            }));
          }
          // Pour les options à barrière (avec knockout ou knockin dans leur type)
          else if (option.type.includes('knockout') || option.type.includes('knockin')) {
            // Trouver l'option correspondante dans la stratégie pour obtenir les valeurs de barrière
            const strategyOption = strategy.find(opt => opt.type === option.type);
            
            if (strategyOption) {
              // Approximation de la volatilité implicite par calibration inverse
              // Essayer différentes valeurs de volatilité et trouver celle qui donne le prix le plus proche
              let bestSigma = 0.20; // Valeur initiale
              let bestDiff = Infinity;
              const steps = 50;
              
              for (let i = 0; i <= steps; i++) {
                const testSigma = 0.01 + (i / steps) * 0.99; // Test de volatilité entre 1% et 100%
                
                // Calculer le prix de l'option avec cette volatilité
                const testPrice = calculateOptionPrice(
                  option.type,
                  monthResult.forward,
                  option.strike,
                  params.interestRate / 100,
                  monthResult.timeToMaturity,
                  testSigma
                );
                
                // Calculer la différence avec le prix observé
                const diff = Math.abs(testPrice - newPrice);
                
                // Si cette volatilité donne un prix plus proche, la conserver
                if (diff < bestDiff) {
                  bestDiff = diff;
                  bestSigma = testSigma;
                }
              }
              
              // Mettre à jour la volatilité implicite pour ce mois
              setImpliedVolatilities(prev => ({
                ...prev,
                [monthKey]: bestSigma * 100 // Convertir en pourcentage
              }));
            }
          }
          
          // Activer automatiquement l'utilisation des volatilités implicites
          if (!useImpliedVol) {
            setUseImpliedVol(true);
          }
          
          // Recalculer les résultats avec les nouvelles volatilités implicites
          recalculateResults();
        }
      }
    }
  };

  // Fonction pour initialiser les volatilités implicites à partir des prix actuels
  const initializeImpliedVolatilities = () => {
    if (!results) return;
    
    // Stocker les nouvelles volatilités implicites
    const newImpliedVols: {[key: string]: number} = {};
    
    // Pour chaque mois dans les résultats
    results.forEach(monthResult => {
      const date = new Date(monthResult.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      // Essayer d'abord de trouver une option standard (call ou put) pour ce mois
      const standardOption = monthResult.optionPrices.find(opt => 
        opt.type === 'call' || opt.type === 'put'
      );
      
      // Si une option standard est trouvée, utiliser la méthode standard de calcul de IV
      if (standardOption) {
        // Calculer la volatilité implicite à partir du prix actuel
        const impliedVol = calculateImpliedVolatility(
          standardOption.type,
          monthResult.forward,      // Utiliser le prix forward comme S
          standardOption.strike,    // Prix d'exercice
          params.interestRate / 100, // Taux sans risque (conversion en décimal)
          monthResult.timeToMaturity, // Temps jusqu'à maturité
          standardOption.price       // Prix actuel de l'option
        );
        
        // Stocker la volatilité implicite pour ce mois
        if (impliedVol > 0) {
          newImpliedVols[monthKey] = impliedVol;
        }
      } 
      // Sinon, essayer de trouver une option avec barrière
      else {
        const barrierOption = monthResult.optionPrices.find(opt => 
          opt.type.includes('knockout') || opt.type.includes('knockin')
        );
        
        if (barrierOption) {
          // Trouver l'option correspondante dans la stratégie
          const strategyOption = strategy.find(opt => opt.type === barrierOption.type);
          
          if (strategyOption) {
            // Approximation de la volatilité implicite par calibration inverse
            // Essayer différentes valeurs de volatilité et trouver celle qui donne le prix le plus proche
            let bestSigma = 0.20; // Valeur initiale
            let bestDiff = Infinity;
            const steps = 50;
            
            for (let i = 0; i <= steps; i++) {
              const testSigma = 0.01 + (i / steps) * 0.99; // Test de volatilité entre 1% et 100%
              
              // Calculer le prix de l'option avec cette volatilité
              const testPrice = calculateOptionPrice(
                barrierOption.type,
                monthResult.forward,
                barrierOption.strike,
                params.interestRate / 100,
                monthResult.timeToMaturity,
                testSigma
              );
              
              // Calculer la différence avec le prix observé
              const diff = Math.abs(testPrice - barrierOption.price);
              
              // Si cette volatilité donne un prix plus proche, la conserver
              if (diff < bestDiff) {
                bestDiff = diff;
                bestSigma = testSigma;
              }
            }
            
            // Stocker la volatilité implicite pour ce mois
            if (bestSigma > 0) {
              newImpliedVols[monthKey] = bestSigma * 100; // Convertir en pourcentage
            }
          }
        }
      }
    });
    
    // Mettre à jour les volatilités implicites
    setImpliedVolatilities(newImpliedVols);
  };

  // Modifier le gestionnaire d'événements pour "Use my own prices"
  const handleUseCustomPricesToggle = (checked: boolean) => {
    setUseCustomOptionPrices(checked);
    
    // Initialiser les volatilités implicites si nécessaire
    if (checked) {
      // Initialiser les volatilités implicites à partir des prix actuels
      initializeImpliedVolatilities();
      
      // Activer automatiquement l'utilisation des volatilités implicites
      if (!useImpliedVol) {
        setUseImpliedVol(true);
      }
      
      // Recalculer les résultats avec les nouvelles volatilités
      recalculateResults();
    }
  };

  // Gestionnaire pour activer/désactiver l'utilisation des volatilités implicites
  const handleUseImpliedVolToggle = (checked: boolean) => {
    setUseImpliedVol(checked);
    
    // Si on active les volatilités implicites et qu'il n'y en a pas encore, les initialiser
    if (checked && Object.keys(impliedVolatilities).length === 0) {
      initializeImpliedVolatilities();
    }
    
    // Recalculer les résultats avec les nouvelles volatilités implicites
    recalculateResults();
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
          <TabsTrigger value="riskmatrix">Risk Matrix Generator</TabsTrigger>
        </TabsList>
        
        <TabsContent value="parameters">
          <Card className="shadow-md">
            <CardHeader className="pb-2 border-b">
              <CardTitle className="text-xl font-bold text-primary">Options Strategy Parameters</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="compact-form-group">
                  <label className="compact-label">Start Date</label>
                  <Input
                    type="date"
                    value={params.startDate}
                    onChange={(e) => setParams({...params, startDate: e.target.value})}
                    className="compact-input"
                  />
                </div>
                <div className="compact-form-group">
                  <label className="compact-label">Months to Hedge</label>
                  <div className="flex items-center gap-2">
                    <Slider 
                      value={[params.monthsToHedge]} 
                      min={1} 
                      max={36} 
                      step={1}
                      onValueChange={(value) => setParams({...params, monthsToHedge: value[0]})}
                      className="flex-1"
                    />
                  <Input
                    type="number"
                    value={params.monthsToHedge}
                    onChange={(e) => setParams({...params, monthsToHedge: Number(e.target.value)})}
                      className="compact-input w-16 text-center"
                  />
                </div>
                </div>
                <div className="compact-form-group">
                  <label className="compact-label">Interest Rate (%)</label>
                  <div className="flex items-center gap-2">
                    <Slider 
                      value={[params.interestRate]} 
                      min={0} 
                      max={10} 
                      step={0.1}
                      onValueChange={(value) => setParams({...params, interestRate: value[0]})}
                      className="flex-1"
                    />
                  <Input
                    type="number"
                    value={params.interestRate}
                    onChange={(e) => setParams({...params, interestRate: Number(e.target.value)})}
                      className="compact-input w-16 text-center"
                  />
                </div>
                </div>
                <div className="compact-form-group">
                  <label className="compact-label">Total Volume</label>
                  <Input
                    type="number"
                    value={params.totalVolume}
                    onChange={(e) => setParams({...params, totalVolume: Number(e.target.value)})}
                    className="compact-input"
                  />
                </div>
                <div className="compact-form-group">
                  <label className="compact-label">Spot Price</label>
                  <Input
                    type="number"
                    value={params.spotPrice}
                    onChange={(e) => handleSpotPriceChange(Number(e.target.value))}
                    className="compact-input"
                  />
                </div>
              </div>

              <div className="mt-6 pb-4 border-b">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={params.useCustomPeriods}
                    onCheckedChange={toggleCustomPeriods}
                    id="useCustomPeriods"
                  />
                  <label htmlFor="useCustomPeriods" className="text-sm font-medium cursor-pointer">
                    Use Custom Periods Instead of Monthly Hedging
                  </label>
                </div>
                
                {params.useCustomPeriods && (
                  <div className="mt-4 pl-8">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-medium text-foreground/90">Custom Hedging Periods</h4>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={addCustomPeriod}
                        className="flex items-center gap-1 h-8 px-2 text-xs"
                      >
                        <Plus size={14} /> Add Period
                      </Button>
                    </div>
                    
                    {params.customPeriods.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No custom periods defined. Click "Add Period" to create one.</p>
                    ) : (
                      <div className="space-y-2">
                        {params.customPeriods.map((period, index) => (
                          <div key={index} className="grid grid-cols-5 gap-2 items-center p-2 rounded-md bg-muted/50">
                            <div className="col-span-2">
                              <label className="compact-label">Maturity Date</label>
                              <Input
                                type="date"
                                value={period.maturityDate}
                                onChange={(e) => updateCustomPeriod(index, 'maturityDate', e.target.value)}
                                className="compact-input"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="compact-label">Volume</label>
                              <Input
                                type="number"
                                value={period.volume}
                                onChange={(e) => updateCustomPeriod(index, 'volume', Number(e.target.value))}
                                className="compact-input"
                              />
                            </div>
                            <div className="flex items-end justify-end">
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => removeCustomPeriod(index)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                              >
                                <X size={14} />
                              </Button>
                            </div>
                          </div>
                        ))}
                        
                        <div className="mt-2 text-xs text-muted-foreground">
                          Total Volume: {params.customPeriods.reduce((sum, p) => sum + p.volume, 0).toLocaleString()}
                        </div>
                        
                        {Math.abs(params.customPeriods.reduce((sum, p) => sum + p.volume, 0) - params.totalVolume) > 0.01 && (
                          <div className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            <span>The sum of custom periods volumes ({params.customPeriods.reduce((sum, p) => sum + p.volume, 0).toLocaleString()}) 
                            differs from the total volume ({params.totalVolume.toLocaleString()}).</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <h3 className="text-base font-medium mb-3 text-primary">Real Price Simulation</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Switch
                    checked={realPriceParams.useSimulation}
                      onCheckedChange={(checked) => setRealPriceParams(prev => ({...prev, useSimulation: checked}))}
                      id="useMonteCarloSimulation"
                  />
                    <label htmlFor="useMonteCarloSimulation" className="text-sm font-medium cursor-pointer">
                      Use Monte Carlo Simulation for Real Prices
                    </label>
                </div>
                  
                  {realPriceParams.useSimulation && (
                    <div className="compact-form-group pl-8">
                      <label className="compact-label">Number of Price Path Simulations</label>
                      <div className="flex items-center gap-2">
                        <Slider 
                          value={[realPriceParams.numSimulations]} 
                          min={100} 
                          max={10000} 
                          step={100}
                          onValueChange={(value) => setRealPriceParams(prev => ({...prev, numSimulations: value[0]}))}
                          className="flex-1"
                        />
                  <Input
                    type="number"
                    value={realPriceParams.numSimulations}
                    onChange={(e) => setRealPriceParams(prev => ({...prev, numSimulations: Number(e.target.value)}))}
                    min="100"
                    max="10000"
                    step="100"
                          className="compact-input w-20 text-center"
                  />
                </div>
                    </div>
                  )}
                  
                </div>
              </div>
              
              <div className="mt-6 pt-4 border-t">
                <h3 className="text-base font-medium mb-3 text-primary">Barrier Option Simulation</h3>
                <div className="space-y-3">
                  <div className="compact-form-group">
                    <label className="compact-label">Number of Simulations for Barrier Options</label>
                    <div className="flex items-center gap-2">
                      <Slider 
                        value={[barrierOptionSimulations]} 
                        min={100} 
                        max={10000} 
                        step={100}
                        onValueChange={(value) => setBarrierOptionSimulations(value[0])}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        value={barrierOptionSimulations}
                        onChange={(e) => setBarrierOptionSimulations(Number(e.target.value))}
                        min="100"
                        max="10000"
                        step="100"
                        className="compact-input w-20 text-center"
                      />
                    </div>
                  </div>
                  
                  <div className="compact-form-group">
                    <label className="compact-label">Pricing Method for Barrier Options</label>
                    <div className="flex items-center space-x-4 mt-1">
                      <div className="flex items-center">
                  <input
                          id="monte-carlo"
                          name="calculation-method"
                          type="radio"
                          className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
                          checked={!useClosedFormBarrier}
                          onChange={() => setUseClosedFormBarrier(false)}
                        />
                        <label htmlFor="monte-carlo" className="ml-2 block text-sm text-gray-700">
                          Monte Carlo Simulation
                        </label>
                      </div>
                      <div className="flex items-center">
                        <input
                          id="closed-form"
                          name="calculation-method"
                          type="radio"
                          className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
                          checked={useClosedFormBarrier}
                          onChange={() => setUseClosedFormBarrier(true)}
                        />
                        <label htmlFor="closed-form" className="ml-2 block text-sm text-gray-700">
                          Closed-Form Solution
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Closed-form solutions provide faster and more accurate pricing for standard barrier options
                    </p>
                  </div>
                    </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md mt-4">
            <CardHeader className="pb-2 border-b flex flex-row items-center justify-between">
              <CardTitle className="text-xl font-bold text-primary">Strategy Components</CardTitle>
              <div className="flex gap-2">
                <Button onClick={addOption} size="sm" className="h-8 px-3 text-sm flex items-center gap-1">
                  <Plus size={14} /> Add Option
              </Button>
                <Button onClick={addSwap} size="sm" variant="outline" className="h-8 px-3 text-sm flex items-center gap-1">
                  <Plus size={14} /> Add Swap
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
                        <option value="call-knockout">Call Knock-Out</option>
                        <option value="call-reverse-knockout">Call Reverse Knock-Out</option>
                        <option value="call-double-knockout">Call Double Knock-Out</option>
                        <option value="put-knockout">Put Knock-Out</option>
                        <option value="put-reverse-knockout">Put Reverse Knock-Out</option>
                        <option value="put-double-knockout">Put Double Knock-Out</option>
                        <option value="call-knockin">Call Knock-In</option>
                        <option value="call-reverse-knockin">Call Reverse Knock-In</option>
                        <option value="call-double-knockin">Call Double Knock-In</option>
                        <option value="put-knockin">Put Knock-In</option>
                        <option value="put-reverse-knockin">Put Reverse Knock-In</option>
                        <option value="put-double-knockin">Put Double Knock-In</option>
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
                    
                    {/* Add barrier inputs for barrier option types */}
                    {component.type.includes('knockout') || component.type.includes('knockin') ? (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">Barrier</label>
                          <Input
                            type="number"
                            value={component.barrier || 0}
                            onChange={(e) => updateOption(index, 'barrier', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Barrier Type</label>
                          <select
                            className="w-full p-2 border rounded"
                            value={component.barrierType || 'percent'}
                            onChange={(e) => updateOption(index, 'barrierType', e.target.value)}
                          >
                            <option value="percent">Percentage</option>
                            <option value="absolute">Absolute</option>
                          </select>
                        </div>
                        
                        {/* For double barrier options */}
                        {component.type.includes('double') && (
                          <div>
                            <label className="block text-sm font-medium mb-1">Second Barrier</label>
                            <Input
                              type="number"
                              value={component.secondBarrier || 0}
                              onChange={(e) => updateOption(index, 'secondBarrier', Number(e.target.value))}
                            />
                          </div>
                        )}
                      </>
                    ) : null}
                    
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
                        <option value="call-knockout">Call Knock-Out</option>
                        <option value="call-reverse-knockout">Call Reverse Knock-Out</option>
                        <option value="call-double-knockout">Call Double Knock-Out</option>
                        <option value="put-knockout">Put Knock-Out</option>
                        <option value="put-reverse-knockout">Put Reverse Knock-Out</option>
                        <option value="put-double-knockout">Put Double Knock-Out</option>
                        <option value="call-knockin">Call Knock-In</option>
                        <option value="call-reverse-knockin">Call Reverse Knock-In</option>
                        <option value="call-double-knockin">Call Double Knock-In</option>
                        <option value="put-knockin">Put Knock-In</option>
                        <option value="put-reverse-knockin">Put Reverse Knock-In</option>
                        <option value="put-double-knockin">Put Double Knock-In</option>
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
                    className="w-full text-left p-3 hover:bg-gray-50"
                  >
                    <button
                      onClick={() => toggleInputs(key)}
                      className="w-full text-left p-3 hover:bg-gray-50"
                    >
                      <span className="font-medium">{scenario.name}</span>
                      <svg
                        className={`w-4 h-4 transform transition-transform ${showInputs[key] ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {showInputs[key] && (
                      <div className="px-3 pb-3">
                        <p className="text-xs text-gray-600 mb-2">{scenario.description}</p>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-sm font-medium mb-1">Volatility (%)</label>
                            <Input
                              className="h-7"
                              type="number"
                              value={scenario.volatility * 100}
                              onChange={(e) => updateScenario(key, 'volatility', Number(e.target.value) / 100)}
                              step="0.1"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Drift (%)</label>
                            <Input
                              className="h-7"
                              type="number"
                              value={scenario.drift * 100}
                              onChange={(e) => updateScenario(key, 'drift', Number(e.target.value) / 100)}
                              step="0.1"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium mb-1">Price Shock (%)</label>
                            <Input
                              className="h-7"
                              type="number"
                              value={scenario.priceShock * 100}
                              onChange={(e) => updateScenario(key, 'priceShock', Number(e.target.value) / 100)}
                              step="0.1"
                            />
                          </div>
                          {scenario.forwardBasis !== undefined && (
                            <div>
                              <label className="block text-sm font-medium mb-1">Monthly Basis (%)</label>
                              <Input
                                className="h-7"
                                type="number"
                                value={scenario.forwardBasis * 100}
                                onChange={(e) => updateScenario(key, 'forwardBasis', Number(e.target.value) / 100)}
                                step="0.1"
                              />
                            </div>
                          )}
                          {scenario.realBasis !== undefined && (
                            <div>
                              <label className="block text-sm font-medium mb-1">Monthly Basis (%)</label>
                              <Input
                                className="h-7"
                                type="number"
                                value={scenario.realBasis * 100}
                                onChange={(e) => updateScenario(key, 'realBasis', Number(e.target.value) / 100)}
                                step="0.1"
                              />
                        </div>
                          )}
                        </div>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            applyStressTest(key);
                          }}
                          className="w-full bg-[#0f172a] text-white hover:bg-[#1e293b] mt-4"
                        >
                          Run Scenario
                        </Button>
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
              <CardTitle>Historical Data Backtest</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 mb-4">
                    <Button 
                  variant={showHistoricalData ? "outline" : "default"}
                      onClick={() => setShowHistoricalData(!showHistoricalData)}
                    >
                      {showHistoricalData ? 'Hide' : 'Show'} Historical Data
                    </Button>
                    <Button 
                  variant={showMonthlyStats ? "outline" : "default"}
                      onClick={() => setShowMonthlyStats(!showMonthlyStats)}
                    >
                      {showMonthlyStats ? 'Hide' : 'Show'} Monthly Statistics
                    </Button>
                <div className="flex-grow" />
                <Button onClick={addHistoricalDataRow}>
                  <Plus className="w-4 h-4 mr-2" /> Add Row
                    </Button>
                <div className="flex flex-col sm:flex-row gap-2 items-center">
                  <Select value={csvFormat} onValueChange={(value) => setCsvFormat(value as 'english' | 'french')}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="CSV Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="english">English (Point .)</SelectItem>
                      <SelectItem value="french">French (Comma ,)</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Button onClick={importHistoricalData} className="flex-grow sm:flex-grow-0">
                  Import Historical Data
                    </Button>
                </div>
                <Button variant="destructive" onClick={clearHistoricalData}>
                  Clear Data
                    </Button>
                </div>
                
                {showHistoricalData && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-2 bg-gray-50">Date</th>
                          <th className="border p-2 bg-gray-50">Price</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicalData.map((point, index) => (
                          <tr key={index}>
                            <td className="border p-2">{point.date}</td>
                            <td className="border p-2">{point.price.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              {showMonthlyStats && monthlyStats.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Monthly Statistics</h3>
                  <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <th className="border p-2 bg-gray-50">Month</th>
                          <th className="border p-2 bg-gray-50">Average Price</th>
                          <th className="border p-2 bg-gray-50">Historical Volatility</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyStats.map((stat, index) => (
                          <tr key={index}>
                            <td className="border p-2">{stat.month}</td>
                            <td className="border p-2">{stat.avgPrice.toFixed(2)}</td>
                            <td className="border p-2">
                              {stat.volatility ? `${(stat.volatility * 100).toFixed(2)}%` : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
            </CardContent>
          </Card>
          
          {results && (
            <div>
              {/* Affichage des résultats... */}
              
              {/* Ajouter ces boutons ici si nécessaire */}
              <div className="mt-6 flex flex-col md:flex-row gap-3">
                <Button 
                  onClick={saveHistoricalBacktestResults} 
                  variant="outline"
                  className="flex-1"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Backtest
                </Button>
                <Link to="/saved" className="flex-1">
                  <Button variant="secondary" className="w-full">
                    View Saved Scenarios
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="riskmatrix">
          <Card>
            <CardHeader>
              <CardTitle>Risk Matrix Generator</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Price Ranges</h3>
                  <div className="space-y-4">
                    {priceRanges.map((range, index) => (
                      <div key={index} className="grid grid-cols-3 gap-4">
                        <div>
                          <Label>Min</Label>
                          <Input 
                            type="number" 
                            value={range.min}
                            onChange={(e) => updatePriceRange(index, 'min', Number(e.target.value))}
                          />
              </div>
                        <div>
                          <Label>Max</Label>
                          <Input 
                            type="number" 
                            value={range.max}
                            onChange={(e) => updatePriceRange(index, 'max', Number(e.target.value))}
                          />
                        </div>
                        <div>
                          <Label>Probability (%)</Label>
                          <Input 
                            type="number" 
                            value={range.probability}
                            onChange={(e) => updatePriceRange(index, 'probability', Number(e.target.value))}
                          />
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between">
                      <Button
                        onClick={() => setPriceRanges([...priceRanges, { min: 0, max: 0, probability: 0 }])}
                        size="sm"
                      >
                        Add Range
                      </Button>
                      <Button
                        onClick={() => setPriceRanges(priceRanges.slice(0, -1))}
                        variant="destructive"
                        size="sm"
                        disabled={priceRanges.length <= 1}
                      >
                        Remove Last
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Strategies</h3>
                  <div className="space-y-4">
                    {matrixStrategies.map((strat, index) => (
                      <div key={index} className="p-4 border rounded-md">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-medium">{strat.name}</h4>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeMatrixStrategy(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div>
                          <Label>Coverage Ratio (%)</Label>
                          <div className="flex items-center gap-4">
                            <Slider
                              value={[strat.coverageRatio]}
                              min={0}
                              max={100}
                              step={1}
                              onValueChange={(value) => handleCoverageRatioChange(index, value[0])}
                              className="flex-1"
                            />
                            <span className="w-12 text-right">{strat.coverageRatio}%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <Button
                      onClick={addMatrixStrategy}
                      className="w-full"
                      disabled={strategy.length === 0}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Current Strategy
                    </Button>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2">
                <Button onClick={generateRiskMatrix} className="w-full">
                  Generate Risk Matrix
                </Button>
                <Button 
                  onClick={toggleCoverageVariations} 
                  className="w-full"
                  variant="outline"
                >
                  {showCoverageVariations ? "Show Original View" : "Show Coverage Variations"}
                </Button>
                <Button 
                  onClick={clearAllStrategies} 
                  className="w-full"
                  variant="destructive"
                >
                  Clear Strategies
                </Button>
                {riskMatrixResults.length > 0 && (
                  <>
                    <Button 
                      onClick={saveRiskMatrix} 
                      className="w-full"
                      variant="outline"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      Save Risk Matrix
                    </Button>
                    <Button 
                      onClick={exportRiskMatrixToPDF} 
                      className="w-full"
                      variant="outline"
                    >
                      Export as PDF
                    </Button>
                  </>
                )}
              </div>

              {riskMatrixResults.length > 0 && (
                <div className="mt-8 overflow-x-auto">
                  <h3 className="text-lg font-semibold mb-4">Risk Matrix Results</h3>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="border p-2">Strategy</th>
                        <th className="border p-2">Coverage Ratio</th>
                        <th className="border p-2">Hedging Cost (k$)</th>
                        {priceRanges.map((range, i) => (
                          <th key={i} className="border p-2">{range.probability}%<br/>[{range.min},{range.max}]</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {showCoverageVariations 
                        ? riskMatrixResults.flatMap((result, i) => {
                            const strategyName = result.name.replace(/\s\d+%$/, '');
                            const ratios = [25, 50, 75, 100];
                            
                            return ratios.map((ratio) => (
                              <tr key={`${i}-${ratio}`}>
                                <td className="border p-2">{strategyName}</td>
                                <td className="border p-2">{ratio}%</td>
                                <td className="border p-2">{((result.hedgingCost / result.coverageRatio) * ratio / 1000).toFixed(1)}</td>
                                
                                {priceRanges.map((range, j) => {
                                  const rangeKey = `${range.min},${range.max}`;
                                  // Ajuster la valeur en fonction du ratio
                                  const adjustedValue = (result.differences[rangeKey] / result.coverageRatio) * ratio;
                                  
                                  return (
                                    <td 
                                      key={j} 
                                      className="border p-2"
                                      style={{ backgroundColor: getCellColor(adjustedValue) }}
                                    >
                                      {(adjustedValue / 1000).toFixed(1)}
                          </td>
                                  );
                                })}
                              </tr>
                            ));
                          })
                        : riskMatrixResults.map((result, i) => (
                            <tr key={i}>
                              <td className="border p-2">{result.name}</td>
                          <td className="border p-2">{result.coverageRatio}%</td>
                              <td className="border p-2">{(result.hedgingCost / 1000).toFixed(1)}</td>
                              
                          {priceRanges.map((range, j) => {
                            const rangeKey = `${range.min},${range.max}`;
                            return (
                              <td 
                                key={j} 
                                className="border p-2"
                                style={{ backgroundColor: getCellColor(result.differences[rangeKey]) }}
                              >
                                {(result.differences[rangeKey] / 1000).toFixed(1)}
                              </td>
                            );
                          })}
                        </tr>
                          ))
                      }
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {results && (
        <>
          <Card className="shadow-lg border border-border/40 overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent pb-3 border-b">
              <CardTitle className="text-xl font-bold text-primary flex items-center gap-2">
                <Table className="h-5 w-5" />
                Detailed Results
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {results.length > 0 && (
                <div>
                  <div className="flex items-center p-4 bg-muted/30">
                    <div className="flex items-center">
                      <Switch
                      id="useCustomPrices"
                      checked={useCustomOptionPrices}
                      onCheckedChange={handleUseCustomPricesToggle}
                      className="mr-2"
                    />
                      <label htmlFor="useCustomPrices" className="text-sm font-medium cursor-pointer">
                      Use my own prices
                    </label>
                  </div>
                  
                    <div className="ml-4 flex items-center">
                      <Switch
                        id="useImpliedVolUI"
                        checked={useImpliedVol}
                        onCheckedChange={handleUseImpliedVolToggle}
                        className="mr-2"
                      />
                      <label htmlFor="useImpliedVolUI" className="text-sm font-medium cursor-pointer">
                        Use Implied Volatility
                      </label>
                      {useCustomOptionPrices && useImpliedVol && (
                        <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full ml-2">
                          Auto-calcul
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="custom-scrollbar">
                    <table className="w-full">
                  <thead>
                        <tr className="bg-muted/50 text-xs uppercase tracking-wider">
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b">Maturity</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b">Time to Maturity</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-blue-500/5">Forward Price</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-primary/5">Real Price</th>
                      {useImpliedVol && (
                            <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-amber-500/5">IV (%)</th>
                      )}
                      {results[0].optionPrices.map((opt, i) => (
                            <th key={`opt-header-${i}`} className="px-3 py-3 text-left font-medium text-foreground/70 border-b">{opt.label}</th>
                          ))}
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-green-500/5">Strategy Price</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-purple-500/5">Strategy Payoff</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b">Volume</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-green-500/5">Hedged Cost</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-red-500/5">Unhedged Cost</th>
                          <th className="px-3 py-3 text-left font-medium text-foreground/70 border-b bg-indigo-500/5">Delta P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((row, i) => {
                      const date = new Date(row.date);
                      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                          const isEven = i % 2 === 0;
                          
                          const getPnLColor = (value: number) => {
                            if (value > 0) return 'text-green-600';
                            if (value < 0) return 'text-red-600';
                            return '';
                          };
                          
                      return (
                            <tr key={i} className={`${isEven ? 'bg-muted/20' : 'bg-background'} hover:bg-muted/40 transition-colors`}>
                              <td className="px-3 py-2 text-sm border-b border-border/30">{row.date}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30">{row.timeToMaturity.toFixed(4)}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-blue-500/5">
                          <Input
                            type="number"
                              value={(() => {
                                const date = new Date(row.date);
                                const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                                return manualForwards[monthKey] || row.forward.toFixed(2);
                              })()}
                            onChange={(e) => {
                                const date = new Date(row.date);
                                const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                              const newValue = e.target.value === '' ? '' : Number(e.target.value);
                              setManualForwards(prev => ({
                                ...prev,
                                [monthKey]: newValue
                              }));
                            }}
                            onBlur={() => calculateResults()}
                                  className="compact-input w-32 text-right"
                            step="0.01"
                          />
                        </td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-primary/5">
                          <Input
                            type="number"
                              value={(() => {
                                const date = new Date(row.date);
                                const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                                return realPriceParams.useSimulation ? 
                              row.realPrice.toFixed(2) : 
                                  (realPrices[monthKey] || row.forward);
                              })()}
                            onChange={(e) => {
                                const date = new Date(row.date);
                                const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                              const newValue = e.target.value === '' ? '' : Number(e.target.value);
                              setRealPrices(prev => ({
                                ...prev,
                                [monthKey]: newValue
                              }));
                            }}
                            onBlur={() => calculateResults()}
                                  className="compact-input w-32 text-right"
                            step="0.01"
                            disabled={realPriceParams.useSimulation}
                          />
                        </td>
                          {useImpliedVol && (
                                <td className="px-3 py-2 text-sm border-b border-border/30 bg-amber-500/5">
                              <div className="flex flex-col">
                              <Input
                                type="number"
                                value={impliedVolatilities[monthKey] || ''}
                                onChange={(e) => handleImpliedVolChange(monthKey, Number(e.target.value))}
                                onBlur={() => calculateResults()}
                                  className="compact-input w-24"
                                placeholder="Enter IV"
                              />
                                {useCustomOptionPrices && impliedVolatilities[monthKey] && (
                                  <span className="text-xs text-amber-600 mt-1"></span>
                                )}
                              </div>
                            </td>
                          )}
                          {/* Afficher d'abord les prix des swaps */}
                          {row.optionPrices
                            .filter(opt => opt.type === 'swap')
                                .map((opt, j) => {
                                  // Créer une clé unique pour ce swap à cette date
                                  const date = new Date(row.date);
                                  const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                                  const optionKey = `${opt.type}-${j}`;
                                  
                                  // Récupérer le prix personnalisé s'il existe, ou utiliser le prix calculé
                                  const customPrice = 
                                    customOptionPrices[monthKey]?.[optionKey] !== undefined
                                      ? customOptionPrices[monthKey][optionKey]
                                      : opt.price;
                                  
                                  return (
                                    <td key={`swap-${j}`} className="px-3 py-2 text-sm border-b border-border/30">
                                      {useCustomOptionPrices ? (
                                        <Input
                                          type="number"
                                          value={customPrice.toFixed(2)}
                                          onChange={(e) => {
                                            const newValue = e.target.value === '' ? 0 : Number(e.target.value);
                                            // Mettre à jour les prix personnalisés et calculer la volatilité implicite
                                            handleCustomPriceChange(monthKey, optionKey, newValue);
                                          }}
                                          onBlur={() => recalculateResults()}
                                          className="compact-input w-24 text-right"
                                          step="0.01"
                                        />
                                      ) : (
                                        <span className="font-mono">{opt.price.toFixed(2)}</span>
                                      )}
                                    </td>
                                  );
                                })}
                          {/* Puis afficher les prix des options */}
                          {row.optionPrices
                            .filter(opt => opt.type !== 'swap')
                                .map((opt, j) => {
                                  // Créer une clé unique pour cet option à cette date
                                  const date = new Date(row.date);
                                  const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                                  const optionKey = `${opt.type}-${j}`;
                                  
                                  // Récupérer le prix personnalisé s'il existe, ou utiliser le prix calculé
                                  const customPrice = 
                                    customOptionPrices[monthKey]?.[optionKey] !== undefined
                                      ? customOptionPrices[monthKey][optionKey]
                                      : opt.price;
                                  
                                  return (
                                    <td key={`option-${j}`} className="px-3 py-2 text-sm border-b border-border/30">
                                      {useCustomOptionPrices ? (
                                        <Input
                                          type="number"
                                          value={customPrice.toFixed(2)}
                                          onChange={(e) => {
                                            const newValue = e.target.value === '' ? 0 : Number(e.target.value);
                                            // Mettre à jour les prix personnalisés et calculer la volatilité implicite
                                            handleCustomPriceChange(monthKey, optionKey, newValue);
                                          }}
                                          onBlur={() => recalculateResults()}
                                          className="compact-input w-24 text-right"
                                          step="0.01"
                                        />
                                      ) : (
                                        <span className="font-mono">{opt.price.toFixed(2)}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-green-500/5 font-medium font-mono">{row.strategyPrice.toFixed(2)}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-purple-500/5 font-medium font-mono">{row.totalPayoff.toFixed(2)}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30">
                          <Input
                            type="number"
                            value={(() => {
                              const date = new Date(row.date);
                              const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                              return customVolumes[monthKey] || row.monthlyVolume;
                            })()}
                            onChange={(e) => {
                              const date = new Date(row.date);
                              const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                              const newValue = e.target.value === '' ? 0 : Number(e.target.value);
                              handleVolumeChange(monthKey, newValue);
                            }}
                            onBlur={() => recalculateResults()}
                                  className="compact-input w-32 text-right"
                            step="1"
                          />
                        </td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-green-500/5 font-medium font-mono">{row.hedgedCost.toFixed(2)}</td>
                              <td className="px-3 py-2 text-sm border-b border-border/30 bg-red-500/5 font-medium font-mono">{row.unhedgedCost.toFixed(2)}</td>
                              <td className={`px-3 py-2 text-sm border-b border-border/30 bg-indigo-500/5 font-medium font-mono ${getPnLColor(row.deltaPnL)}`}>
                                {row.deltaPnL.toFixed(2)}
                              </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
                </div>
              )}
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

          {/* Monte Carlo Simulation Card */}
          <Card>
            <CardHeader>
              <CardTitle>Monte Carlo Simulation</CardTitle>
              <CardDescription>Visualize price paths and option price evolution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-row justify-between mb-4">
                <div>
                  <Button 
                    onClick={() => {
                      if (results) {
                        if (!simulationData) {
                          recalculateMonteCarloSimulations(); 
                        }
                        setShowMonteCarloVisualization(!showMonteCarloVisualization);
                      } else {
                        alert("Calculate Strategy Results first to generate Monte Carlo simulations.");
                      }
                    }}
                    disabled={!results || isRunningSimulation}
                    className="mr-2"
                  >
                    {isRunningSimulation ? (
                      <>
                        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-e-transparent align-[-0.125em]"></span>
                        Running Simulation...
                      </>
                    ) : showMonteCarloVisualization ? (
                      "Hide Visualization"
                    ) : (
                      "Show Monte Carlo Visualization"
                    )}
                  </Button>
                </div>
                <div className="flex items-center">
                  {isRunningSimulation ? (
                    <span className="text-sm text-blue-600">
                      Calculating simulations...
                    </span>
                  ) : realPriceParams.useSimulation ? (
                    <span className="text-sm text-gray-600">
                      Using {realPriceParams.numSimulations || 1000} simulations (configured in Strategy Parameters)
                    </span>
                  ) : strategy.some(opt => opt.type.includes('knockout') || opt.type.includes('knockin')) ? (
                    <span className="text-sm text-blue-600">
                      Barrier option visualization available (Monte Carlo not used for real prices)
                    </span>
                  ) : (
                    <span className="text-sm text-amber-600 font-semibold">
                      Enable "Use Monte Carlo Simulation" or add barrier options to see visualizations
                    </span>
                  )}
                </div>
              </div>

              {showMonteCarloVisualization && results && simulationData && (
                <div>
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <h4 className="font-medium text-blue-800 mb-1">Monte Carlo Visualization Information</h4>
                    <ul className="list-disc ml-5 text-sm text-blue-700">
                      {realPriceParams.useSimulation && (
                        <li>Displaying {Math.min(100, realPriceParams.numSimulations)} random paths out of {realPriceParams.numSimulations} total simulations</li>
                      )}
                      {realPriceParams.useSimulation && simulationData.realPricePaths.length > 0 && (
                        <li>Real Price Paths: Shows simulated price paths based on the volatility parameters</li>
                      )}
                    </ul>
                  </div>
                  
                  <MonteCarloVisualization 
                    simulationData={{
                      ...simulationData,
                      // S'assurer que nous avons toujours les bonnes données pour les chemins d'options à barrière
                      
                    }} 
                  />
                  
                  
                </div>
              )}
              
              {(!showMonteCarloVisualization || !results || !simulationData) && (
                <div className="text-center py-8 bg-gray-50 rounded-md border border-gray-200">
                  {!results ? (
                    <div>
                      <p className="text-gray-700 font-medium">Calculate Strategy Results First</p>
                      <p className="mt-1 text-sm text-gray-500">Click "Calculate Results" to generate Monte Carlo simulations.</p>
                    </div>
                  ) : !simulationData ? (
                    <div>
                      <p className="text-gray-700 font-medium">No Simulation Data Available</p>
                      <p className="mt-1 text-sm text-gray-500">Please recalculate results to generate simulation data.</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-700 font-medium">Visualization Hidden</p>
                      <p className="mt-1 text-sm text-gray-500">Click "Show Monte Carlo Visualization" to display price paths.</p>
                    </div>
                  )}

                  <Button 
                    onClick={() => {
                      if (results) {
                        if (!simulationData) {
                          recalculateMonteCarloSimulations();
                        }
                        setShowMonteCarloVisualization(true);
                      }
                    }}
                    disabled={!results || isRunningSimulation}
                    className="mt-4"
                  >
                    {!simulationData 
                      ? "Generate Simulation" 
                      : "Show Visualization"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

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
                          <th className="border p-2 text-right">Total Strategy Premium</th>
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
                              {data.strategyPremium.toLocaleString(undefined, {
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
                      <td className="border p-2 font-medium">Total Strategy Premium</td>
                      <td className="border p-2 text-right">
                        {results.reduce((sum, row) => sum + (row.strategyPrice * row.monthlyVolume), 0).toLocaleString(undefined, {
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
                    <tr>
                      <td className="border p-2 font-medium">Strike Target</td>
                      <td className="border p-2 text-right">
                        {(() => {
                          const totalHedgedCost = results.reduce((sum, row) => sum + row.hedgedCost, 0);
                          const totalVolume = results.reduce((sum, row) => sum + row.monthlyVolume, 0);
                          return totalVolume > 0 
                            ? ((-1) * totalHedgedCost / totalVolume).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })
                            : 'N/A';
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly & Yearly P&L Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                {results.length > 0 && (() => {
                  // Organiser les données par année et par mois
                  const pnlByYearMonth: Record<string, Record<string, number>> = {};
                  const yearTotals: Record<string, number> = {};
                  const monthTotals: Record<string, number> = {};
                  let grandTotal = 0;
                  
                  // Collecter toutes les années et tous les mois uniques
                  const years: Set<string> = new Set();
                  const months: string[] = [
                    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
                  ];
                  
                  // Initialiser la structure de données
                  results.forEach(result => {
                    const date = new Date(result.date);
                    const year = date.getFullYear().toString();
                    const month = date.getMonth();
                    const monthKey = months[month];
                    
                    years.add(year);
                    
                    if (!pnlByYearMonth[year]) {
                      pnlByYearMonth[year] = {};
                      yearTotals[year] = 0;
                    }
                    
                    if (!pnlByYearMonth[year][monthKey]) {
                      pnlByYearMonth[year][monthKey] = 0;
                    }
                    
                    // Ajouter le P&L au mois correspondant
                    pnlByYearMonth[year][monthKey] += result.deltaPnL;
                    
                    // Mettre à jour les totaux
                    yearTotals[year] += result.deltaPnL;
                    if (!monthTotals[monthKey]) monthTotals[monthKey] = 0;
                    monthTotals[monthKey] += result.deltaPnL;
                    grandTotal += result.deltaPnL;
                  });
                  
                  // Convertir l'ensemble des années en tableau trié
                  const sortedYears = Array.from(years).sort();
                  
                  // Fonction pour appliquer une couleur en fonction de la valeur
                  const getPnLColor = (value: number) => {
                    if (value > 0) return 'bg-green-100';
                    if (value < 0) return 'bg-red-100';
                    return '';
                  };
                  
                  // Fonction pour formater les valeurs de P&L
                  const formatPnL = (value: number) => {
                    if (Math.abs(value) < 0.01) return '0';
                    // Formater en milliers avec un point de séparation de milliers
                    return (value / 1000).toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 3
                    });
                  };
                  
                  return (
                    <table className="min-w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border p-2 font-semibold text-left"></th>
                          {months.map(month => (
                            <th key={month} className="border p-2 font-semibold text-center w-20">{month}</th>
                          ))}
                          <th className="border p-2 font-semibold text-center w-20">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedYears.map(year => (
                          <tr key={year}>
                            <td className="border p-2 font-semibold">{year}</td>
                            {months.map(month => {
                              const value = pnlByYearMonth[year][month] || 0;
                              return (
                                <td 
                                  key={`${year}-${month}`} 
                                  className={`border p-2 text-right ${getPnLColor(value)}`}
                                >
                                  {value ? formatPnL(value) : '-'}
                                </td>
                              );
                            })}
                            <td className={`border p-2 text-right font-semibold ${getPnLColor(yearTotals[year])}`}>
                              {formatPnL(yearTotals[year])}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50">
                          <td className="border p-2 font-semibold">Total</td>
                          {months.map(month => (
                            <td 
                              key={`total-${month}`} 
                              className={`border p-2 text-right font-semibold ${getPnLColor(monthTotals[month] || 0)}`}
                            >
                              {monthTotals[month] ? formatPnL(monthTotals[month]) : '-'}
                            </td>
                          ))}
                          <td className={`border p-2 text-right font-semibold ${getPnLColor(grandTotal)}`}>
                            {formatPnL(grandTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Index; 