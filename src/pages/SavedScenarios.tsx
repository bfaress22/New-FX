import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { SavedScenario } from '../types/Scenario';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import ScenariosPdfExport from '../components/ScenariosPdfExport';

// Add this interface for yearly results
interface YearlyResult {
  hedgedCost: number;
  unhedgedCost: number;
  deltaPnL: number;
  strategyPremium: number;
  volume: number;
}

// Ajouter la fonction generateFXHedgingData depuis PayoffChart.tsx
const generateFXHedgingData = (strategy: any[], spot: number, includePremium: boolean = false) => {
  const data = [];
  const minSpot = spot * 0.7;  // -30% du spot
  const maxSpot = spot * 1.3;  // +30% du spot
  const step = (maxSpot - minSpot) / 100; // 100 points

  for (let currentSpot = minSpot; currentSpot <= maxSpot; currentSpot += step) {
    const unhedgedRate = currentSpot;
    let hedgedRate = currentSpot;
    let totalPremium = 0;

    // Process each option in the strategy
    strategy.forEach(option => {
      const strike = option.strikeType === 'percent' 
        ? spot * (option.strike / 100) 
        : option.strike;
      
      // Utilise la quantité avec son signe (+ pour achat, - pour vente)
      const quantity = option.quantity / 100;
      
      // Calculate option premium (simplified)
      const premium = 0.01 * Math.abs(quantity); // Prime simplifiée, toujours positive
      
      if (option.type === 'put') {
        // PUT: La logique change selon achat ou vente
        if (currentSpot < strike) {
          // Dans la monnaie
          if (quantity > 0) {
            // ACHAT PUT: Protection contre la baisse
            hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
          } else if (quantity < 0) {
            // VENTE PUT: Obligation d'achat à un prix élevé
            hedgedRate = currentSpot + ((strike - currentSpot) * Math.abs(quantity));
          }
        }
        // Hors de la monnaie: pas d'effet sur le taux (sauf prime)
      } 
      else if (option.type === 'call') {
        // CALL: La logique change selon achat ou vente
        if (currentSpot > strike) {
          // Dans la monnaie
          if (quantity > 0) {
            // ACHAT CALL: Protection contre la hausse
            hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
          } else if (quantity < 0) {
            // VENTE CALL: Obligation de vente à un prix bas
            hedgedRate = currentSpot + ((currentSpot - strike) * Math.abs(quantity));
          }
        }
        // Hors de la monnaie: pas d'effet sur le taux (sauf prime)
      }
      else if (option.type === 'forward') {
        // FORWARD: Taux fixe peu importe le spot
        hedgedRate = strike * Math.abs(quantity) + currentSpot * (1 - Math.abs(quantity));
      }
      else if (option.type === 'swap') {
        // SWAP: Échange à taux fixe
        hedgedRate = strike;
      }
      
      // Barrier options (simplified logic)
      else if (option.type.includes('knockout') || option.type.includes('knockin')) {
        const barrier = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        
        let isBarrierBroken = false;
        
        if (option.type.includes('knockout')) {
          if (option.type.includes('call')) {
            isBarrierBroken = currentSpot >= barrier;
          } else if (option.type.includes('put')) {
            isBarrierBroken = currentSpot <= barrier;
          }
        } else if (option.type.includes('knockin')) {
          if (option.type.includes('call')) {
            isBarrierBroken = currentSpot >= barrier;
          } else if (option.type.includes('put')) {
            isBarrierBroken = currentSpot <= barrier;
          }
        }
        
        if (option.type.includes('knockout')) {
          // Option knocked out = pas de protection
          if (!isBarrierBroken) {
            if (option.type.includes('call') && currentSpot > strike) {
              if (quantity > 0) {
                hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
              } else if (quantity < 0) {
                hedgedRate = currentSpot + ((currentSpot - strike) * Math.abs(quantity));
              }
            } else if (option.type.includes('put') && currentSpot < strike) {
              if (quantity > 0) {
                hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
              } else if (quantity < 0) {
                hedgedRate = currentSpot + ((strike - currentSpot) * Math.abs(quantity));
              }
            }
          }
        } else { // knockin
          // Option knocked in = protection active
          if (isBarrierBroken) {
            if (option.type.includes('call') && currentSpot > strike) {
              if (quantity > 0) {
                hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
              } else if (quantity < 0) {
                hedgedRate = currentSpot + ((currentSpot - strike) * Math.abs(quantity));
              }
            } else if (option.type.includes('put') && currentSpot < strike) {
              if (quantity > 0) {
                hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
              } else if (quantity < 0) {
                hedgedRate = currentSpot + ((strike - currentSpot) * Math.abs(quantity));
              }
            }
          }
        }
      }
      
      // Ajuster pour la prime avec le signe correct selon achat/vente
      if (quantity > 0) {
        // Pour les achats d'options, on paie la prime (coût négatif)
        totalPremium += premium;
      } else if (quantity < 0) {
        // Pour les ventes d'options, on reçoit la prime (gain positif)
        totalPremium -= premium;
      }
    });

    // Ajuster pour la prime si incluse
    if (includePremium && strategy.length > 0) {
      hedgedRate -= totalPremium;
    }

    data.push({
      spot: parseFloat(currentSpot.toFixed(4)),
      unhedgedRate: parseFloat(unhedgedRate.toFixed(4)),
      hedgedRate: parseFloat(hedgedRate.toFixed(4))
    });
  }

  return data;
};

// Custom tooltip for FX hedging profile
const CustomFXTooltip = ({ 
  active, 
  payload, 
  label, 
  currencyPair
}: any) => {
  
  if (active && payload && payload.length) {
    const hedgedValue = payload.find((p: any) => p.dataKey === 'hedgedRate')?.value;
    const unhedgedValue = payload.find((p: any) => p.dataKey === 'unhedgedRate')?.value;
    const protection = hedgedValue && unhedgedValue ? (hedgedValue - unhedgedValue) : 0;
    
    return (
      <div className="p-3 rounded-lg shadow-lg bg-background border border-border">
        <p className="font-semibold">
          {currencyPair?.symbol || 'FX'} Rate: {Number(label).toFixed(4)}
        </p>
        {payload.map((entry: any, index: number) => (
          <p key={`item-${index}`} style={{ color: entry.color }}>
            {entry.name}: {Number(entry.value).toFixed(4)}
          </p>
        ))}
        <hr className="my-2 border-border" />
        <p className="text-sm font-medium">
          Protection: {protection > 0 ? '+' : ''}{protection.toFixed(4)}
          {protection > 0 ? ' ✅' : protection < 0 ? ' ❌' : ' ⚪'}
        </p>
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Base:</span> {currencyPair?.base || 'BASE'}
          {' | '}
          <span className="font-medium">Quote:</span> {currencyPair?.quote || 'QUOTE'}
        </p>
      </div>
    );
  }

  return null;
};

const SavedScenarios = () => {
  const [scenarios, setScenarios] = React.useState<SavedScenario[]>([]);
  const [selectedScenarios, setSelectedScenarios] = React.useState<string[]>([]);
  const [expandedSections, setExpandedSections] = React.useState<Record<string, Record<string, boolean>>>({});
  const navigate = useNavigate();

  // Initialize expanded state for each scenario
  const initializeExpandedState = (scenarioId: string) => ({
    strategy: false,
    detailedResults: false,
    yearlyStats: false,
    totalStats: false,
    monthlyPnL: false
  });

  // Toggle section visibility
  const toggleSection = (scenarioId: string, section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [scenarioId]: {
        ...(prev[scenarioId] || initializeExpandedState(scenarioId)),
        [section]: !(prev[scenarioId]?.[section] ?? false)
      }
    }));
  };

  React.useEffect(() => {
    const savedScenarios = localStorage.getItem('optionScenarios');
    if (savedScenarios) {
      setScenarios(JSON.parse(savedScenarios));
    }
  }, []);

  const deleteScenario = (id: string) => {
    const updatedScenarios = scenarios.filter(scenario => scenario.id !== id);
    setScenarios(updatedScenarios);
    localStorage.setItem('optionScenarios', JSON.stringify(updatedScenarios));
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getScenarioTypeName = (scenario: SavedScenario) => {
    if (!scenario.stressTest) return 'Base Calculation';
    return scenario.stressTest.name;
  };

  // Add the calculateYearlyResults function
  const calculateYearlyResults = (results: SavedScenario['results']): Record<string, YearlyResult> => {
    // Vérifier le format des dates dans les résultats
    if (results.length > 0) {
      console.log('Sample date:', results[0].date, 'Type:', typeof results[0].date);
      console.log('Date parsed:', new Date(results[0].date));
    }
    
    return results.reduce((acc: Record<string, YearlyResult>, row) => {
      // Extraire l'année depuis la date correctement
      let year: string;
      
      try {
        // Essayer d'abord avec Date
        const date = new Date(row.date);
        if (!isNaN(date.getTime())) {
          year = date.getFullYear().toString();
        } else {
          // Si la date n'est pas valide, essayer de l'extraire du format de chaîne
          // Format possible: "Jan 2023" ou similaire
          const parts = row.date.split(' ');
          if (parts.length > 1) {
            year = parts[1]; // Prendre la deuxième partie qui devrait être l'année
          } else {
            // Dernier recours, utiliser la chaîne complète
            year = row.date;
          }
        }
      } catch (error) {
        console.error('Erreur lors de l\'extraction de l\'année:', error);
        year = 'undefined';
      }
      
      if (!acc[year]) {
        acc[year] = {
          hedgedCost: 0,
          unhedgedCost: 0,
          deltaPnL: 0,
          strategyPremium: 0,
          volume: 0
        };
      }
      
      acc[year].hedgedCost += row.hedgedCost;
      acc[year].unhedgedCost += row.unhedgedCost;
      acc[year].deltaPnL += row.deltaPnL;
      acc[year].strategyPremium += (row.strategyPrice * row.monthlyVolume);
      acc[year].volume += row.monthlyVolume;
      
      return acc;
    }, {});
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Saved Scenarios</h1>
        <Link to="/">
          <Button>Back to Calculator</Button>
        </Link>
      </div>

      {scenarios.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p>No saved scenarios yet. Run a simulation to save your first scenario.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <ScenariosPdfExport
            scenarios={scenarios}
            selectedScenarios={selectedScenarios}
            setSelectedScenarios={setSelectedScenarios}
          />
          {scenarios.map(scenario => (
            <Card key={scenario.id} className="mb-6">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{scenario.name}</CardTitle>
                  <p className="text-sm text-gray-500">{formatDate(scenario.timestamp)}</p>
                  <p className="text-sm font-medium mt-1">Type: {getScenarioTypeName(scenario)}</p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => deleteScenario(scenario.id)}
                  className="flex items-center gap-2"
                >
                  <Trash2 size={16} /> Delete
                </Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <h3 className="font-semibold mb-2">Basic Parameters</h3>
                    <ul className="space-y-1">
                      <li>Start Date: {scenario.params.startDate}</li>
                      <li>Months to Hedge: {scenario.params.monthsToHedge}</li>
                      <li>Interest Rate: {scenario.params.interestRate}%</li>
                      {scenario.params.baseVolume && scenario.params.quoteVolume ? (
                        <>
                          <li>Base Volume ({scenario.params.currencyPair?.base || 'BASE'}): {scenario.params.baseVolume.toLocaleString()}</li>
                          <li>Quote Volume ({scenario.params.currencyPair?.quote || 'QUOTE'}): {Math.round(scenario.params.quoteVolume).toLocaleString()}</li>
                          <li>Rate: {scenario.params.spotPrice?.toFixed(4)}</li>
                        </>
                      ) : (
                        <>
                          <li>Total Volume: {scenario.params.totalVolume?.toLocaleString()}</li>
                      <li>Spot Price: {scenario.params.spotPrice}</li>
                        </>
                      )}
                    </ul>
                  </div>
                  {scenario.stressTest && (
                    <div>
                      <h3 className="font-semibold mb-2">Stress Test Parameters</h3>
                      <ul className="space-y-1">
                        <li>Volatility: {(scenario.stressTest.volatility * 100).toFixed(1)}%</li>
                        <li>Drift: {(scenario.stressTest.drift * 100).toFixed(1)}%</li>
                        <li>Price Shock: {(scenario.stressTest.priceShock * 100).toFixed(1)}%</li>
                        {scenario.stressTest.forwardBasis && (
                          <li>Forward Basis: {(scenario.stressTest.forwardBasis * 100).toFixed(1)}%</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <Button
                    variant="outline"
                    onClick={() => toggleSection(scenario.id, 'strategy')}
                    className="flex items-center gap-2 mb-2"
                  >
                    {expandedSections[scenario.id]?.strategy ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    Strategy Components
                  </Button>
                  
                  {expandedSections[scenario.id]?.strategy && (
                    <div className="mt-2">
                      {scenario.strategy.map((option, index) => (
                        <div key={index} className="grid grid-cols-5 gap-4 p-2 border-b">
                          <div>Type: {option.type}</div>
                          <div>Strike: {option.strike} ({option.strikeType})</div>
                          <div>Volatility: {option.volatility}%</div>
                          <div>Quantity: {option.quantity}%</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="h-64" id={`pnl-chart-${scenario.id}`}>
                    <h3 className="font-semibold mb-2">P&L Evolution</h3>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={scenario.results}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="deltaPnL" name="Delta P&L" stroke="#8884d8" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="h-80" id={`fx-hedging-chart-${scenario.id}`}>
                    <h3 className="font-semibold mb-2">FX Hedging Profile</h3>
                    <div className="text-sm text-muted-foreground mb-2">
                      Hedged vs Unhedged {scenario.params.currencyPair?.symbol || 'FX'} rates across market scenarios
                    </div>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart 
                        data={generateFXHedgingData(scenario.strategy, scenario.params.spotPrice, false)}
                        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis
                          dataKey="spot"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(value) => value.toFixed(3)}
                          label={{
                            value: `${scenario.params.currencyPair?.symbol || 'FX'} Rate`,
                            position: "insideBottom",
                            offset: -10,
                          }}
                        />
                        <YAxis
                          tickFormatter={(value) => value.toFixed(3)}
                          label={{
                            value: `Effective Rate (${scenario.params.currencyPair?.quote || 'Quote Currency'})`,
                            angle: -90,
                            position: "insideLeft",
                          }}
                        />
                        <Tooltip content={
                          <CustomFXTooltip currencyPair={scenario.params.currencyPair} />
                        } />
                        <Legend 
                          verticalAlign="top" 
                          height={36}
                        />
                        
                        {/* Unhedged rate line (reference) */}
                        <Line
                          type="monotone"
                          dataKey="unhedgedRate"
                          stroke="#9CA3AF"
                          strokeWidth={2}
                          strokeDasharray="4 4"
                          dot={false}
                          name="Unhedged Rate"
                        />
                        
                        {/* Hedged rate line */}
                        <Line
                          type="monotone"
                          dataKey="hedgedRate"
                          stroke="#3B82F6"
                          strokeWidth={3}
                          dot={false}
                          activeDot={{ r: 6, fill: "#3B82F6" }}
                          name="Hedged Rate"
                        />
                        
                        {/* Reference line for current spot */}
                        <ReferenceLine
                          x={scenario.params.spotPrice}
                          stroke="#059669"
                          strokeWidth={2}
                          strokeDasharray="5 5"
                          label={{
                            value: "Current Spot",
                            position: "top",
                            fill: "#059669",
                            fontSize: 11,
                          }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="mt-6">
                  <Button
                    variant="outline"
                    onClick={() => toggleSection(scenario.id, 'detailedResults')}
                    className="flex items-center gap-2 mb-2"
                  >
                    {expandedSections[scenario.id]?.detailedResults ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    Detailed Results
                  </Button>
                  
                  {expandedSections[scenario.id]?.detailedResults && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="border p-2">Maturity</th>
                            <th className="border p-2">Time to Maturity</th>
                            <th className="border p-2">Forward Price</th>
                            <th className="border p-2">Real Price</th>
                            <th className="border p-2">IV (%)</th>
                            {scenario.results[0]?.optionPrices?.map((option, idx) => (
                              <th key={idx} className="border p-2">{option.label || `${option.type.charAt(0).toUpperCase() + option.type.slice(1)} Price ${idx + 1}`}</th>
                            ))}
                            <th className="border p-2">Strategy Price</th>
                            <th className="border p-2">Payoff</th>
                            <th className="border p-2">Volume</th>
                            <th className="border p-2">Hedged Cost</th>
                            <th className="border p-2">Unhedged Cost</th>
                            <th className="border p-2">Delta P&L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scenario.results.map((row, i) => {
                            // Récupération de la volatilité implicite pour cette date
                            const date = row.date;
                            let impliedVol = null;
                            
                            // 1. Vérifier si l'utilisateur a entré des valeurs manuelles d'IV
                            if (scenario.useImpliedVol && scenario.impliedVolatilities && scenario.impliedVolatilities[date]) {
                              impliedVol = scenario.impliedVolatilities[date];
                            }
                            // 2. Utiliser la volatilité de la stratégie comme dernier recours
                            else if (scenario.strategy && scenario.strategy.length > 0) {
                              impliedVol = scenario.strategy[0].volatility / 100;
                            }
                            
                            return (
                              <tr key={i}>
                                <td className="border p-2">{row.date}</td>
                                <td className="border p-2">{row.timeToMaturity.toFixed(4)}</td>
                                <td className="border p-2">{row.forward.toFixed(2)}</td>
                                <td className="border p-2">{row.realPrice.toFixed(2)}</td>
                                <td className="border p-2">
                                  {impliedVol !== null 
                                    ? (impliedVol * 100).toFixed(0) 
                                    : ""}
                                </td>
                                {/* S'assurer que toutes les options sont affichées */}
                                {row.optionPrices && Array.isArray(row.optionPrices) 
                                  ? row.optionPrices.map((option, idx) => (
                                      <td key={idx} className="border p-2">{option.price.toFixed(2)}</td>
                                    ))
                                  : scenario.strategy.map((_, idx) => (
                                      <td key={idx} className="border p-2">-</td>
                                    ))
                                }
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
                  )}
                </div>

                <div className="mt-6">
                  <Button
                    variant="outline"
                    onClick={() => toggleSection(scenario.id, 'yearlyStats')}
                    className="flex items-center gap-2 mb-2"
                  >
                    {expandedSections[scenario.id]?.yearlyStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    Summary Statistics by Year
                  </Button>
                  
                  {expandedSections[scenario.id]?.yearlyStats && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="border p-2">Year</th>
                            <th className="border p-2">Hedged Cost</th>
                            <th className="border p-2">Unhedged Cost</th>
                            <th className="border p-2">Delta P&L</th>
                            <th className="border p-2">Strategy Premium</th>
                            <th className="border p-2">Strike Target</th>
                            <th className="border p-2">Cost Reduction (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(calculateYearlyResults(scenario.results)).map(([year, data]) => {
                            // Ajouter un log pour débogage
                            console.log('Year:', year, 'Data:', data);
                            return (
                              <tr key={year}>
                                <td className="border p-2">{year}</td>
                                <td className="border p-2">{data.hedgedCost.toFixed(2)}</td>
                                <td className="border p-2">{data.unhedgedCost.toFixed(2)}</td>
                                <td className="border p-2">{data.deltaPnL.toFixed(2)}</td>
                                <td className="border p-2">{data.strategyPremium.toFixed(2)}</td>
                                <td className="border p-2">
                                  {data.volume > 0 ? (Math.abs(data.hedgedCost) / data.volume).toFixed(2) : 'N/A'}
                                </td>
                                <td className="border p-2">
                                  {((data.deltaPnL / Math.abs(data.unhedgedCost)) * 100).toFixed(2)}%
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <Button
                    variant="outline"
                    onClick={() => toggleSection(scenario.id, 'totalStats')}
                    className="flex items-center gap-2 mb-2"
                  >
                    {expandedSections[scenario.id]?.totalStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    Total Summary Statistics
                  </Button>
                  
                  {expandedSections[scenario.id]?.totalStats && (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <tbody>
                          <tr>
                            <td className="border p-2 font-medium">Total Cost with Hedging</td>
                            <td className="border p-2 text-right">
                              {scenario.results.reduce((sum, row) => sum + row.hedgedCost, 0).toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td className="border p-2 font-medium">Total Cost without Hedging</td>
                            <td className="border p-2 text-right">
                              {scenario.results.reduce((sum, row) => sum + row.unhedgedCost, 0).toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td className="border p-2 font-medium">Total P&L</td>
                            <td className="border p-2 text-right">
                              {scenario.results.reduce((sum, row) => sum + row.deltaPnL, 0).toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td className="border p-2 font-medium">Total Strategy Premium</td>
                            <td className="border p-2 text-right">
                              {scenario.results.reduce((sum, row) => sum + (row.strategyPrice * row.monthlyVolume), 0).toFixed(2)}
                            </td>
                          </tr>
                          <tr>
                            <td className="border p-2 font-medium">Cost Reduction (%)</td>
                            <td className="border p-2 text-right">
                              {(() => {
                                const totalPnL = scenario.results.reduce((sum, row) => sum + row.deltaPnL, 0);
                                const totalUnhedgedCost = scenario.results.reduce((sum, row) => sum + row.unhedgedCost, 0);
                                return ((totalPnL / Math.abs(totalUnhedgedCost)) * 100).toFixed(2);
                              })()}%
                            </td>
                          </tr>
                          <tr>
                            <td className="border p-2 font-medium">Strike Target</td>
                            <td className="border p-2 text-right">
                              {(() => {
                                const totalHedgedCost = scenario.results.reduce((sum, row) => sum + row.hedgedCost, 0);
                                const totalVolume = scenario.results.reduce((sum, row) => sum + row.monthlyVolume, 0);
                                return totalVolume > 0 
                                  ? Number(Math.abs(totalHedgedCost) / totalVolume).toFixed(2)
                                  : 'N/A';
                              })()}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <Button
                    variant="outline"
                    onClick={() => toggleSection(scenario.id, 'monthlyPnL')}
                    className="flex items-center gap-2 mb-2"
                  >
                    {expandedSections[scenario.id]?.monthlyPnL ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    Monthly & Yearly P&L Breakdown
                  </Button>
                  
                  {expandedSections[scenario.id]?.monthlyPnL && (
                    <div className="overflow-x-auto">
                      {(() => {
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
                        scenario.results.forEach(result => {
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
                  )}
                </div>

                <Button
                  onClick={() => {
                    localStorage.setItem('calculatorState', JSON.stringify({
                      params: scenario.params,
                      strategy: scenario.strategy,
                      results: scenario.results,
                      payoffData: scenario.payoffData,
                      // Récupérer les paramètres personnalisés du scénario sauvegardé ou utiliser des valeurs par défaut
                      manualForwards: scenario.manualForwards || {},
                      realPrices: scenario.realPrices || {},
                      realPriceParams: {
                        useSimulation: false,
                        volatility: 0.3,
                        drift: 0.01,
                        numSimulations: 1000
                      },
                      barrierOptionSimulations: 1000,
                      useClosedFormBarrier: false,
                      activeTab: 'parameters',
                      customScenario: scenario.stressTest,
                      stressTestScenarios: {}, // You might want to save this too
                      // Récupérer les paramètres de volatilité implicite
                      useImpliedVol: scenario.useImpliedVol || false,
                      impliedVolatilities: scenario.impliedVolatilities || {},
                      // Récupérer les prix personnalisés des options
                      customOptionPrices: scenario.customOptionPrices || {}
                    }));
                    navigate('/');
                  }}
                  className="mt-4"
                >
                  Load This Scenario
                </Button>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
};

export default SavedScenarios; 