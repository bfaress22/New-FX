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
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  isHistorical?: boolean;
  historicalData?: HistoricalDataPoint[];
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
    
    const updatedResults = results.map(row => {
      // Créer une clé unique pour le mois
      const date = new Date(row.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      // Utiliser le volume personnalisé s'il existe, sinon le volume par défaut
      const volume = customVolumes[monthKey] || row.monthlyVolume;
      
      // Recalculer les coûts et le P&L avec le nouveau volume
      const unhedgedCost = -(volume * row.realPrice);
      
      // Calculer les volumes couverts/non couverts en fonction des options
      const totalSwapPercentage = strategy
        .filter(s => s.type === 'swap')
        .reduce((sum, swap) => sum + swap.quantity, 0) / 100;
      
      const hedgedCost = -(volume * row.realPrice) + 
        (volume * (1 - totalSwapPercentage) * row.totalPayoff) - 
        (volume * (1 - totalSwapPercentage) * row.strategyPrice);
      
      const deltaPnL = hedgedCost - unhedgedCost;
      
      return {
        ...row,
        monthlyVolume: volume,
        unhedgedCost,
        hedgedCost,
        deltaPnL
      };
    });
    
    setResults(updatedResults);
  };

  // Calculate Black-Scholes Option Price
  const calculateOptionPrice = (type, S, K, r, t, sigma, date?) => {
    // Utiliser le nombre de mois spécifié par l'utilisateur
    const timeInYears = params.monthsToHedge / 12; // Convertir les mois en années
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
    
    months.forEach((date) => {
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      
      // Generate random walk
      const randomWalk = Math.random() * 2 - 1; // Simple normal approximation
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
    const months = [];
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

    // If simulation is enabled, generate new real prices
    if (realPriceParams.useSimulation) {
      const simulatedPrices = simulateRealPrices(months, startDate);
      setRealPrices(simulatedPrices);
    }

    const timeToMaturities = months.map(date => {
        const diffTime = Math.abs(date.getTime() - startDate.getTime());
      return diffTime / (325.25 * 24 * 60 * 60 * 1000);
    });

    const monthlyVolume = params.totalVolume / params.monthsToHedge;

    const detailedResults = months.map((date, i) => {
      // Get forward price
      const forward = (() => {
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        const timeDiff = date.getTime() - startDate.getTime();
        return manualForwards[monthKey] || 
          initialSpotPrice * Math.exp(params.interestRate/100 * timeDiff/(1000 * 60 * 60 * 24 * 365));
      })();

      // Get real price and store monthKey for reuse
      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
      const realPrice = realPrices[monthKey] || forward;

      const t = timeToMaturities[i];

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

      // Calculer les prix des options comme avant
        const optionPrices = options.map((option, optIndex) => {
            const strike = option.strikeType === 'percent' ? 
          params.spotPrice * (option.strike/100) : 
                option.strike;
            
            return {
                type: option.type,
                price: calculateOptionPrice(
                    option.type,
                    forward,
                    strike,
            params.interestRate/100,
            t,
            option.volatility/100,
                    date
                ),
          quantity: option.quantity/100,
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

      // Ensuite, utiliser ces variables dans le calcul du hedgedCost
        const totalSwapPercentage = swaps.reduce((sum, swap) => sum + swap.quantity, 0) / 100;
        const hedgedPrice = totalSwapPercentage * swapPrice + (1 - totalSwapPercentage) * realPrice;

        const hedgedCost = -(monthlyVolume * hedgedPrice) - 
            (monthlyVolume * (1 - totalSwapPercentage) * strategyPrice) + 
            (monthlyVolume * (1 - totalSwapPercentage) * totalPayoff);

        return {
            date: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
        timeToMaturity: t,
            forward,
            realPrice,
            optionPrices: [
                ...optionPrices,
                ...swaps.map(swap => ({
                    type: 'swap',
                    price: swapPrice,
            quantity: swap.quantity/100,
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
    calculatePayoff();
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
    setRealPriceParams({
      useSimulation: !scenario.realBasis, // Désactiver la simulation si on utilise realBasis
      volatility: scenario.volatility,
      drift: scenario.drift
    });
    
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
      const year = row.date.split(' ')[1];
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

  // Mettre à jour la fonction d'import
  const importHistoricalData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            const rows = text.split('\n').filter(row => row.trim());
            
            const data: HistoricalDataPoint[] = rows
                .map(row => {
                    try {
            // Nettoyer la ligne des guillemets et diviser par virgule
            const columns = row.replace(/"/g, '').split(',');
            
            if (columns.length < 2) return null;
            
            // Parse la date (format DD/MM/YYYY)
            const [day, month, year] = columns[0].split('/');
                        const date = new Date(`${year}-${month}-${day}`);
                        
                        if (isNaN(date.getTime())) {
              console.error('Invalid date:', columns[0]);
              return null;
            }

            // Parse le prix (deuxième colonne)
            // Nettoyer le prix des espaces et points de mille
            const priceStr = columns[1]
              .replace(/\s/g, '')        // Enlever les espaces
              .replace(/\./g, '')        // Enlever les points de mille
              .replace(',', '.');        // Remplacer la virgule décimale par un point
            
                        const price = Number(priceStr);

                        if (isNaN(price)) {
              console.error('Invalid price:', columns[1]);
              return null;
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
        // Trier par date décroissante (plus récent en premier)
        const sortedData = data.sort((a, b) => b.date.localeCompare(a.date));
        setHistoricalData(sortedData);
        calculateMonthlyStats(sortedData);
            } else {
                alert('No valid data found in CSV file. Please check the format.');
            }
        };
        reader.readAsText(file);
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
    // Vérifier si la stratégie existe déjà
    const strategyName = strategy.map(comp => 
      `${comp.type} ${comp.strike}${comp.strikeType === 'percent' ? '%' : ''}`
    ).join(' + ');
    
    const existingStrategyIndex = matrixStrategies.findIndex(s => 
      s.name === strategyName && s.coverageRatio === params.coverageRatio
    );
    
    if (existingStrategyIndex !== -1) {
      alert("Cette stratégie existe déjà dans la matrice de risque.");
      return;
    }
    
    // Ajouter la nouvelle stratégie sans effacer les existantes
    setMatrixStrategies(prev => [
      ...prev,
      {
        components: [...strategy],
        coverageRatio: params.coverageRatio,
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
          
          // Calculer le payoff pour ce prix médian
          const totalPayoff = strategyConfig.components.reduce((sum, comp) => {
            const strike = comp.strikeType === 'percent' 
              ? params.spotPrice * (comp.strike / 100) 
              : comp.strike;
            
            if (comp.type === 'call') {
              return sum + Math.max(0, midPrice - strike) * (comp.quantity/100);
            } else if (comp.type === 'put') {
              return sum + Math.max(0, strike - midPrice) * (comp.quantity/100);
            } else { // swap
              return sum + (midPrice - strike) * (comp.quantity/100);
            }
          }, 0);

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
    
    // Créer un nom basé sur les composants
    const strategyName = strategy.map(comp => {
      if (comp.type === 'swap') return 'Swap';
      return `${comp.type === 'call' ? 'Call' : 'Put'} Option`;
    }).join('/');
    
    setMatrixStrategies([
      ...matrixStrategies,
      {
        components: [...strategy],
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
      
      if (comp.type === 'swap') {
        // Correction du payoff de swap
        totalPayoff += (price - strike) * comp.quantity;
      } else if (comp.type === 'call') {
        totalPayoff += Math.max(0, price - strike) * comp.quantity;
      } else { // put
        totalPayoff += Math.max(0, strike - price) * comp.quantity;
      }
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
      id: Date.now().toString(),
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
      id: Date.now().toString(),
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
      }
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
                <Button variant="default" className="relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={importHistoricalData}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  Import Historical Data
                    </Button>
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
                      const date = new Date(row.date);
                      const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
                      return (
                      <tr key={i}>
                        <td className="border p-2">{row.date}</td>
                        <td className="border p-2">{row.timeToMaturity.toFixed(4)}</td>
                        <td className="border p-2">
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
                            className="w-32 text-right"
                            step="0.01"
                          />
                        </td>
                        <td className="border p-2">
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
                        <td className="border p-2">
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
                            className="w-32 text-right"
                            step="1"
                          />
                        </td>
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