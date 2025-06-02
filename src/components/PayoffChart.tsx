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
import { BloombergChart } from "./BloombergChart";
import { useThemeContext } from "@/hooks/ThemeProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
      else if (option.type.includes('one-touch')) {
        const barrier = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        
        // Appliquer le rebate en % du volume mensuel au lieu d'une valeur fixe
        // La quantité représente le % du volume total qui est couvert
        if (currentSpot >= barrier) {
          // Utiliser rebate comme pourcentage du volume (que la quantité couvre déjà)
          const rebateAmount = ((option.rebate || 5) / 100) * Math.abs(quantity) * 100;
          hedgedRate = currentSpot + rebateAmount;
        }
      }
      else if (option.type.includes('no-touch')) {
        const barrier = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        
        if (currentSpot < barrier) {
          // Utiliser rebate comme pourcentage du volume
          const rebateAmount = ((option.rebate || 5) / 100) * Math.abs(quantity) * 100;
          hedgedRate = currentSpot + rebateAmount;
        }
      }
      else if (option.type.includes('double-touch')) {
        const barrier1 = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        const barrier2 = option.barrierType === 'percent' 
          ? spot * (option.secondBarrier / 100) 
          : option.secondBarrier;
        
        if (currentSpot >= barrier1 || currentSpot <= barrier2) {
          // Utiliser rebate comme pourcentage du volume
          const rebateAmount = ((option.rebate || 5) / 100) * Math.abs(quantity) * 100;
          hedgedRate = currentSpot + rebateAmount;
        }
      }
      else if (option.type.includes('double-no-touch')) {
        const barrier1 = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        const barrier2 = option.barrierType === 'percent' 
          ? spot * (option.secondBarrier / 100) 
          : option.secondBarrier;
        
        if (currentSpot < barrier1 && currentSpot > barrier2) {
          // Utiliser rebate comme pourcentage du volume
          const rebateAmount = ((option.rebate || 5) / 100) * Math.abs(quantity) * 100;
          hedgedRate = currentSpot + rebateAmount;
        }
      }
      else if (option.type === 'range-binary') {
        const upperBound = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        const lowerBound = option.strikeType === 'percent'
          ? spot * (option.strike / 100)
          : option.strike;
        
        if (currentSpot <= upperBound && currentSpot >= lowerBound) {
          // Utiliser rebate comme pourcentage du volume
          const rebateAmount = ((option.rebate || 5) / 100) * Math.abs(quantity) * 100;
          hedgedRate = currentSpot + rebateAmount;
        }
      }
      else if (option.type === 'outside-binary') {
        const upperBound = option.barrierType === 'percent' 
          ? spot * (option.barrier / 100) 
          : option.barrier;
        const lowerBound = option.strikeType === 'percent'
          ? spot * (option.strike / 100)
          : option.strike;
        
        if (currentSpot > upperBound || currentSpot < lowerBound) {
          // Utiliser rebate comme pourcentage du volume
          const rebateAmount = ((option.rebate || 5) / 100) * Math.abs(quantity) * 100;
          hedgedRate = currentSpot + rebateAmount;
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
  const [activeTab, setActiveTab] = useState<"payoff" | "hedging">("payoff");
  const { theme } = useThemeContext();
  const isBloombergTheme = theme === 'bloomberg';
  
  const fxHedgingData = useMemo(() => {
    return generateFXHedgingData(strategy, spot, includePremium);
  }, [strategy, spot, includePremium]);
  
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

  // Si le thème Bloomberg est activé, utiliser le BloombergChart spécialisé
  if (isBloombergTheme) {
    return (
      <Card className={`${className} bloomberg-theme`}>
        <CardHeader className="pb-2 border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold text-orange-500">
              {activeTab === "payoff" ? "PAYOFF CHART" : "FX HEDGING PROFILE"}
            </CardTitle>
            <Tabs 
              value={activeTab} 
              onValueChange={(value) => setActiveTab(value as "payoff" | "hedging")}
              className="ml-auto"
            >
              <TabsList className="bg-secondary">
                <TabsTrigger value="payoff" className="text-sm">Payoff</TabsTrigger>
                <TabsTrigger value="hedging" className="text-sm">FX Hedging</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="text-sm text-muted-foreground mt-1 font-mono">
            {getStrategyName()}
          </div>
        </CardHeader>
        <CardContent className="pt-4 px-2">
          {activeTab === "payoff" ? (
            <BloombergChart 
              data={data}
              spotPrice={spot}
              title="Payoff Chart"
              height={400}
            />
          ) : (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart 
                data={fxHedgingData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                style={{ backgroundColor: '#101418', borderRadius: '4px' }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3039" />
                <XAxis 
                  dataKey="spot"
                  domain={["dataMin", "dataMax"]}
                  tick={{ fill: '#aaa' }}
                  tickLine={{ stroke: '#aaa' }}
                  axisLine={{ stroke: '#aaa' }}
                  label={{
                    value: 'Spot Rate',
                    position: 'insideBottom',
                    offset: -5,
                    style: {
                      fill: '#aaa',
                      fontFamily: '"Roboto Mono", monospace',
                      fontSize: '12px'
                    }
                  }}
                />
                <YAxis 
                  tick={{ fill: '#aaa' }}
                  tickLine={{ stroke: '#aaa' }}
                  axisLine={{ stroke: '#aaa' }}
                  label={{
                    value: 'Effective Rate',
                    angle: -90,
                    position: 'insideLeft',
                    style: {
                      fill: '#aaa',
                      fontFamily: '"Roboto Mono", monospace',
                      fontSize: '12px'
                    }
                  }}
                />
                <Tooltip 
                  content={<CustomTooltip currencyPair={currencyPair} />}
                />
                <Legend 
                  wrapperStyle={{
                    fontFamily: '"Roboto Mono", monospace',
                    fontSize: '12px',
                    color: '#aaa'
                  }}
                />
                <ReferenceLine
                  x={spot}
                  stroke="#21a621"
                  strokeDasharray="3 3"
                  label={{
                    value: `Spot: ${spot.toFixed(2)}`,
                    position: 'top',
                    fill: '#21a621',
                    fontSize: '10px',
                    fontFamily: '"Roboto Mono", monospace'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="unhedgedRate"
                  stroke="#777"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={false}
                  name="Unhedged Rate"
                />
                <Line
                  type="monotone"
                  dataKey="hedgedRate"
                  stroke="#ffa500"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, stroke: '#ffa500', strokeWidth: 2, fill: '#101418' }}
                  name="Hedged Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    );
  }

  // Sinon, utiliser le chart standard existant
  return (
    <Card className={className}>
      <CardHeader className="pb-2 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-semibold">
            {activeTab === "payoff" ? "Payoff Chart" : "FX Hedging Profile"}
        </CardTitle>
          <Tabs 
            value={activeTab} 
            onValueChange={(value) => setActiveTab(value as "payoff" | "hedging")}
            className="ml-auto"
          >
            <TabsList>
              <TabsTrigger value="payoff">Payoff</TabsTrigger>
              <TabsTrigger value="hedging">FX Hedging</TabsTrigger>
            </TabsList>
          </Tabs>
            </div>
        <div className="text-sm text-muted-foreground mt-1">
          {getStrategyName()}
        </div>
      </CardHeader>
      <CardContent className="pt-4 px-2">
        {activeTab === "payoff" ? (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="price" 
                label={{ value: 'Price', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis 
                label={{
                  value: 'Profit/Loss', 
                  angle: -90, 
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip content={<CustomTooltip currencyPair={currencyPair} />} />
              <Legend />
              {getReferenceLines()}
              <Line
                type="monotone"
                dataKey="payoff"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                name="Profit/Loss"
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={fxHedgingData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="spot" 
                label={{ value: 'Spot Rate', position: 'insideBottomRight', offset: -5 }}
              />
              <YAxis
                label={{
                  value: 'Effective Rate', 
                  angle: -90,
                  position: 'insideLeft',
                  style: { textAnchor: 'middle' }
                }}
              />
              <Tooltip content={<CustomTooltip currencyPair={currencyPair} />} />
              <Legend />
              <ReferenceLine
                x={spot}
                stroke="#6B7280"
                strokeDasharray="3 3"
                label={{
                  value: `Current Spot: ${spot.toFixed(4)}`,
                  position: 'top',
                  fill: "#6B7280",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="unhedgedRate"
                stroke="#9CA3AF"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                name="Unhedged Rate"
              />
              <Line
                type="monotone"
                dataKey="hedgedRate"
                stroke="#3B82F6"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, fill: "#3B82F6" }}
                name="Hedged Rate"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export default PayoffChart; 