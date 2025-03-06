export interface CalculatorState {
  params: {
    startDate: string;
    monthsToHedge: number;
    interestRate: number;
    totalVolume: number;
    spotPrice: number;
  };
  strategy: any[];
  results: any;
  payoffData: any[];
  manualForwards: Record<string, number>;
  realPrices: Record<string, number>;
  realPriceParams: {
    useSimulation: boolean;
    volatility: number;
    drift: number;
    numSimulations: number;
  };
  activeTab: string;
  customScenario: any;
  stressTestScenarios: Record<string, any>;
  useImpliedVol: boolean;
  impliedVolatilities: Record<string, number | null>;
}

export type { CalculatorState }; 