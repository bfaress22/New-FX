import React, { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface PayoffChartProps {
  data: Array<{ price: number; payoff: number }>;
  strategy: any[];
  spot: number;
  currencyPair: any;
  includePremium?: boolean;
  className?: string;
}

// Generate FX hedging payoff data based on strategy
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
        // PUT: La logique change selon achat ou vente - INVERSION COMPLÈTE
        if (currentSpot < strike) {
          // Dans la monnaie
          if (quantity > 0) {
            // ACHAT PUT: Protection contre la baisse
            // Formule inversée
            hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
          } else if (quantity < 0) {
            // VENTE PUT: Obligation d'achat à un prix élevé
            // Formule inversée
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
              // Même logique que CALL standard avec quantité signée
              if (quantity > 0) {
                hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
              } else if (quantity < 0) {
                hedgedRate = currentSpot + ((currentSpot - strike) * Math.abs(quantity));
              }
            } else if (option.type.includes('put') && currentSpot < strike) {
              // Même logique inversée que PUT standard avec quantité signée
              if (quantity > 0) {
                // INVERSION pour PUT avec barrière - knockout
                hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
              } else if (quantity < 0) {
                // INVERSION pour PUT avec barrière - knockout
                hedgedRate = currentSpot + ((strike - currentSpot) * Math.abs(quantity));
              }
            }
          }
        } else { // knockin
          // Option knocked in = protection active
          if (isBarrierBroken) {
            if (option.type.includes('call') && currentSpot > strike) {
              // Même logique que CALL standard avec quantité signée
              if (quantity > 0) {
                hedgedRate = currentSpot - ((currentSpot - strike) * Math.abs(quantity));
              } else if (quantity < 0) {
                hedgedRate = currentSpot + ((currentSpot - strike) * Math.abs(quantity));
              }
            } else if (option.type.includes('put') && currentSpot < strike) {
              // Même logique inversée que PUT standard avec quantité signée
              if (quantity > 0) {
                // INVERSION pour PUT avec barrière - knockin
                hedgedRate = currentSpot - ((strike - currentSpot) * Math.abs(quantity));
              } else if (quantity < 0) {
                // INVERSION pour PUT avec barrière - knockin
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

// Custom tooltip component for FX hedging
const CustomTooltip = ({ 
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

const PayoffChart: React.FC<PayoffChartProps> = ({ 
  data, 
  strategy, 
  spot, 
  currencyPair,
  includePremium = false,
  className = ""
}) => {
  const [showPremium, setShowPremium] = useState(includePremium);
  const [showRiskMetrics, setShowRiskMetrics] = useState(true);
  
  // Generate FX hedging data instead of using the passed data
  const chartData = useMemo(() => {
    return generateFXHedgingData(strategy, spot, showPremium);
  }, [strategy, spot, showPremium]);
  
  // Get strategy type for display
  const getStrategyName = () => {
    if (strategy.length === 0) return "No Hedging Strategy";
    if (strategy.length === 1) {
      const option = strategy[0];
      const strikeDisplay = option.strikeType === 'percent' 
        ? `${option.strike}%` 
        : option.strike.toFixed(4);
      return `${option.type.toUpperCase()} ${strikeDisplay}`;
    }
    return "Multi-Leg Hedging Strategy";
  };

  // Configure reference lines based on strategy
  const getReferenceLines = () => {
    const lines = [
      // Current spot line
      <ReferenceLine
        key="spot"
        x={spot}
        stroke="#6B7280"
        strokeWidth={2}
        strokeDasharray="3 3"
        label={{
          value: "Current Spot",
          position: "top",
          fill: "#6B7280",
          fontSize: 12,
        }}
      />
    ];

    // Add strategy-specific reference lines
    strategy.forEach((option, index) => {
      const strike = option.strikeType === 'percent' 
        ? spot * (option.strike / 100) 
        : option.strike;

      // Strike line
      lines.push(
        <ReferenceLine
          key={`strike-${index}`}
          x={strike}
          stroke="#059669"
          strokeWidth={2}
          strokeDasharray="5 5"
          label={{
            value: `${option.type.toUpperCase()} Strike`,
            position: "top",
            fill: "#059669",
            fontSize: 11,
          }}
        />
      );

      // Barrier lines for barrier options
      if (option.barrier && (option.type.includes('knockout') || option.type.includes('knockin'))) {
        const barrier = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;

        const isKnockout = option.type.includes('knockout');
        const barrierColor = isKnockout ? "#DC2626" : "#2563EB";

        lines.push(
          <ReferenceLine
            key={`barrier-${index}`}
            x={barrier}
            stroke={barrierColor}
            strokeWidth={2}
            strokeDasharray="4 4"
            label={{
              value: `${isKnockout ? 'KO' : 'KI'} Barrier`,
              position: "top",
              fill: barrierColor,
              fontSize: 11,
            }}
          />
        );
      }
    });

    return lines;
  };

  const strategyName = getStrategyName();

  // Calculate hedging effectiveness metrics
  const hedgingMetrics = useMemo(() => {
    if (chartData.length === 0) return null;
    
    const protectedPoints = chartData.filter(d => 
      Math.abs(d.hedgedRate - d.unhedgedRate) > 0.0001
    );
    
    const maxProtection = Math.max(...chartData.map(d => d.hedgedRate - d.unhedgedRate));
    const minProtection = Math.min(...chartData.map(d => d.hedgedRate - d.unhedgedRate));
    
    const protectionEffectiveness = protectedPoints.length / chartData.length * 100;
    
    return {
      protectionEffectiveness,
      maxProtection,
      minProtection,
      protectedPoints: protectedPoints.length
    };
  }, [chartData]);

  if (strategy.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>FX Hedging Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            Add hedging instruments to view the protection profile
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>FX Hedging Profile</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch 
                id="show-premium" 
                checked={showPremium} 
                onCheckedChange={setShowPremium}
              />
              <Label htmlFor="show-premium" className="text-sm">Include Premium Cost</Label>
            </div>
            <span className="text-sm font-normal text-muted-foreground">
              {strategyName}
            </span>
          </div>
        </CardTitle>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Compare hedged vs unhedged {currencyPair?.symbol || 'FX'} rates across different market scenarios</p>
          
          {/* Quick metrics row */}
          {hedgingMetrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="text-center p-2 bg-green-50 rounded border">
                <div className="font-medium text-green-700">Max Protection</div>
                <div className="text-green-600 font-semibold">{hedgingMetrics.maxProtection.toFixed(4)}</div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded border">
                <div className="font-medium text-red-700">Max Cost</div>
                <div className="text-red-600 font-semibold">{Math.abs(hedgingMetrics.minProtection).toFixed(4)}</div>
            </div>
              <div className="text-center p-2 bg-blue-50 rounded border">
                <div className="font-medium text-blue-700">Protection Range</div>
                <div className="text-blue-600 font-semibold">{hedgingMetrics.protectionEffectiveness.toFixed(1)}%</div>
              </div>
            <div className="text-center p-2 bg-gray-50 rounded border">
                <div className="font-medium text-gray-700">Current Spot</div>
                <div className="text-gray-600 font-semibold">{spot.toFixed(4)}</div>
              </div>
            </div>
          )}
          
          {/* Risk metrics toggle */}
          <div className="flex items-center space-x-2">
            <Switch 
              id="show-metrics" 
              checked={showRiskMetrics} 
              onCheckedChange={setShowRiskMetrics}
            />
            <Label htmlFor="show-metrics" className="text-xs">Show detailed hedging analysis</Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: "400px", background: "#111", borderRadius: 12, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={chartData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#222" opacity={0.7} />
              <XAxis
                dataKey="spot"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value) => value.toFixed(3)}
                stroke="#EEE"
                tick={{ fill: '#EEE', fontWeight: 600 }}
                label={{
                  value: `${currencyPair?.symbol || 'FX'} Rate`,
                  position: "insideBottom",
                  offset: -10,
                  fill: '#FFB800',
                  fontWeight: 700
                }}
              />
              <YAxis
                tickFormatter={(value) => value.toFixed(3)}
                stroke="#EEE"
                tick={{ fill: '#EEE', fontWeight: 600 }}
                label={{
                  value: `Effective Rate (${currencyPair?.quote || 'Quote Currency'})`,
                  angle: -90,
                  position: "insideLeft",
                  fill: '#FFB800',
                  fontWeight: 700
                }}
              />
              <Tooltip
                content={<CustomTooltip currencyPair={currencyPair} />}
                wrapperStyle={{ background: '#181818', border: '1.5px solid #FFB800', borderRadius: 8, color: '#FFB800' }}
                contentStyle={{ background: '#181818', color: '#FFB800', border: 'none' }}
                labelStyle={{ color: '#FFB800', fontWeight: 700 }}
                itemStyle={{ color: '#FFB800' }}
              />
              <Legend 
                verticalAlign="top" 
                height={36}
                wrapperStyle={{ color: '#FFB800' }}
              />
              {/* Unhedged rate line (reference) */}
              <Line
                type="monotone"
                dataKey="unhedgedRate"
                stroke="#B0B0B0"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                name="Unhedged Rate"
              />
              {/* Hedged rate line */}
              <Line
                type="monotone"
                dataKey="hedgedRate"
                stroke="#FFB800"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, fill: "#FFB800" }}
                name={`Hedged Rate${showPremium ? ' (net of premium)' : ' (excluding premium)'}`}
              />
              {/* Reference lines */}
              {getReferenceLines()}
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Strategy Summary */}
        <div className="mt-4 space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Hedging Strategy Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {strategy.map((option, index) => {
                const strike = option.strikeType === 'percent' 
                  ? `${option.strike}% (${(spot * option.strike / 100).toFixed(4)})` 
                  : option.strike.toFixed(4);
                
                const hedgingLogic = option.type === 'put' 
                  ? (option.quantity > 0 ? '📉 Protection against rate decline (Long Put)' : '📉 Exposure to rate decline (Short Put)')
                  : option.type === 'call'
                  ? (option.quantity > 0 ? '📈 Protection against rate increase (Long Call)' : '📈 Exposure to rate increase (Short Call)')
                  : option.type === 'forward'
                  ? '🔒 Fixed rate hedging'
                  : '💱 Rate swap';
                
                return (
                  <div key={index} className="flex flex-col space-y-1 p-2 bg-background rounded border">
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{option.type.toUpperCase()}</span>
                      <span className="text-xs text-muted-foreground">{option.quantity}% coverage</span>
                    </div>
                    <div className="text-xs">Strike: {strike}</div>
                    <div className="text-xs text-muted-foreground">{hedgingLogic}</div>
                    {option.barrier && (
                      <div className="text-xs text-orange-600">
                        Barrier: {option.barrierType === 'percent' 
                          ? `${option.barrier}% (${(spot * option.barrier / 100).toFixed(4)})` 
                          : option.barrier.toFixed(4)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                <strong>Hedging Logic:</strong> This chart shows how your hedging strategy affects the effective FX rate 
                compared to remaining unhedged across different market scenarios.
                </p>
              </div>
          </div>
          
          {/* Detailed hedging analysis */}
          {showRiskMetrics && hedgingMetrics && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium mb-3 text-blue-800">Hedging Effectiveness Analysis</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="font-medium text-blue-700">Protection Scenarios</div>
                  <div className="text-blue-600">
                    {hedgingMetrics.protectionEffectiveness.toFixed(1)}% of price range protected
                  </div>
                </div>
                <div>
                  <div className="font-medium text-blue-700">Maximum Benefit</div>
                  <div className="text-blue-600">
                    {hedgingMetrics.maxProtection.toFixed(4)} rate improvement
                  </div>
                </div>
                <div>
                  <div className="font-medium text-blue-700">Maximum Cost</div>
                  <div className="text-blue-600">
                    {Math.abs(hedgingMetrics.minProtection).toFixed(4)} opportunity cost
                  </div>
                </div>
              </div>
              
                <div className="mt-3 pt-3 border-t border-blue-200">
                <div className="text-xs text-blue-700">
                  <strong>Interpretation:</strong> The hedged rate line shows your effective FX rate after applying the hedging strategy. 
                  Areas where it diverges from the unhedged line indicate active protection or cost.
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PayoffChart; 