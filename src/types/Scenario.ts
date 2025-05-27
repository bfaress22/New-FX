import { StressTestScenario, StrategyComponent, Result } from '../pages/Index';

export interface SavedScenario {
  id: string;
  name: string;
  timestamp: number;
  params: {
    startDate: string;
    monthsToHedge: number;
    interestRate: number;
    domesticRate?: number;
    foreignRate?: number;
    totalVolume: number;
    baseVolume?: number;
    quoteVolume?: number;
    spotPrice: number;
    currencyPair?: any; // CurrencyPair interface
    useCustomPeriods?: boolean;
    customPeriods?: any[];
  };
  strategy: StrategyComponent[];
  results: Result[];
  payoffData: Array<{ price: number; payoff: number }>;
  stressTest?: StressTestScenario;
  manualForwards?: Record<string, number>;
  realPrices?: Record<string, number>;
  useImpliedVol?: boolean;
  impliedVolatilities?: Record<string, number>;
  customOptionPrices?: Record<string, Record<string, number>>;
} 