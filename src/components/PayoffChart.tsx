import React, { useState } from "react";
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

// Custom tooltip component for better styling
const CustomTooltip = ({ 
  active, 
  payload, 
  label, 
  currencyPair
}: any) => {
  
  if (active && payload && payload.length) {
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
        <p className="text-sm text-muted-foreground">
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
  
  // Get strategy type for display
  const getStrategyName = () => {
    if (strategy.length === 0) return "No Strategy";
    if (strategy.length === 1) {
      const option = strategy[0];
      return `${option.type.toUpperCase()} ${option.strikeType === 'percent' ? option.strike + '%' : option.strike}`;
    }
    return "Custom Strategy";
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
      />,
      // Break-even line (Y=0)
      <ReferenceLine
        key="breakeven"
        y={0}
        stroke="#374151"
        strokeWidth={1}
        strokeDasharray="2 2"
        label={{
          value: "Break-even",
          position: "insideTopRight",
          fill: "#374151",
          fontSize: 10,
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
          strokeWidth={1}
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

        // Second barrier for double barrier options
        if (option.secondBarrier && option.type.includes('double')) {
          const secondBarrier = option.barrierType === 'percent' 
            ? spot * (option.secondBarrier / 100) 
            : option.secondBarrier;

          lines.push(
            <ReferenceLine
              key={`second-barrier-${index}`}
              x={secondBarrier}
              stroke={barrierColor}
              strokeWidth={2}
              strokeDasharray="4 4"
              label={{
                value: `${isKnockout ? 'KO' : 'KI'} Barrier 2`,
                position: "bottom",
                fill: barrierColor,
                fontSize: 11,
              }}
            />
          );
        }
      }
    });

    return lines;
  };

  const chartData = data?.length > 0 ? data : [];
  const strategyName = getStrategyName();

  // Calculate some statistics for display
  const maxPayoff = chartData.length > 0 ? Math.max(...chartData.map(d => d.payoff)) : 0;
  const minPayoff = chartData.length > 0 ? Math.min(...chartData.map(d => d.payoff)) : 0;
  const breakEvenPoints = chartData.filter(d => Math.abs(d.payoff) < 0.01);
  
  // Calculate risk metrics
  const profitZone = chartData.filter(d => d.payoff > 0);
  const lossZone = chartData.filter(d => d.payoff < 0);
  const maxRisk = Math.abs(minPayoff);
  const maxReward = maxPayoff;
  const riskRewardRatio = maxReward > 0 ? maxRisk / maxReward : 0;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>FX Options Payoff Profile</span>
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <Switch 
                id="show-premium" 
                checked={showPremium} 
                onCheckedChange={setShowPremium}
              />
              <Label htmlFor="show-premium" className="text-sm">Include Premium</Label>
            </div>
            <span className="text-sm font-normal text-muted-foreground">
              {strategyName}
            </span>
          </div>
        </CardTitle>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Strategy payoff across different {currencyPair?.symbol || 'FX'} rates at maturity</p>
          
          {/* Quick metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div className="text-center p-2 bg-green-50 rounded border">
              <div className="font-medium text-green-700">Max Profit</div>
              <div className="text-green-600 font-semibold">{maxPayoff.toFixed(4)}</div>
            </div>
            <div className="text-center p-2 bg-red-50 rounded border">
              <div className="font-medium text-red-700">Max Loss</div>
              <div className="text-red-600 font-semibold">{minPayoff.toFixed(4)}</div>
            </div>
            {breakEvenPoints.length > 0 && (
              <div className="text-center p-2 bg-blue-50 rounded border">
                <div className="font-medium text-blue-700">Break-even</div>
                <div className="text-blue-600 font-semibold">{breakEvenPoints[0].price.toFixed(4)}</div>
              </div>
            )}
            <div className="text-center p-2 bg-gray-50 rounded border">
              <div className="font-medium text-gray-700">Risk/Reward</div>
              <div className="text-gray-600 font-semibold">{riskRewardRatio.toFixed(2)}</div>
            </div>
          </div>
          
          {/* Risk metrics toggle */}
          <div className="flex items-center space-x-2">
            <Switch 
              id="show-metrics" 
              checked={showRiskMetrics} 
              onCheckedChange={setShowRiskMetrics}
            />
            <Label htmlFor="show-metrics" className="text-xs">Show detailed risk analysis</Label>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ height: "400px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart 
              data={chartData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="price"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value) => value.toFixed(3)}
                label={{
                  value: `${currencyPair?.symbol || 'FX'} Rate at Maturity`,
                  position: "insideBottom",
                  offset: -10,
                }}
              />
              <YAxis
                tickFormatter={(value) => value.toFixed(3)}
                domain={[
                  (dataMin: number) => Math.min(dataMin, -Math.abs(dataMin) * 0.1), 
                  (dataMax: number) => Math.max(dataMax, Math.abs(dataMax) * 0.1)
                ]}
                label={{
                  value: `Payoff (${currencyPair?.quote || 'Quote Currency'})`,
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <Tooltip content={
                <CustomTooltip currencyPair={currencyPair} />
              } />
              <Legend 
                verticalAlign="top" 
                height={36}
              />
              
              {/* Main payoff line */}
              <Line
                type="monotone"
                dataKey="payoff"
                stroke="#2563EB"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6, fill: "#2563EB" }}
                name={`Strategy Payoff${showPremium ? ' (net of premium)' : ' (excluding premium)'}`}
              />
              
              {/* Reference lines */}
              {getReferenceLines()}
            </LineChart>
          </ResponsiveContainer>
        </div>
        
        {/* Strategy Summary */}
        <div className="mt-4 space-y-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2">Strategy Composition</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
              {strategy.map((option, index) => {
                const strike = option.strikeType === 'percent' 
                  ? `${option.strike}% (${(spot * option.strike / 100).toFixed(4)})` 
                  : option.strike.toFixed(4);
                
                return (
                  <div key={index} className="flex justify-between">
                    <span className="font-medium">{option.type.toUpperCase()}:</span>
                    <span>Strike {strike}, Vol {option.volatility}%, Qty {option.quantity}%</span>
                  </div>
                );
              })}
            </div>
            
            {/* Additional info for barrier options */}
            {strategy.some(opt => opt.barrier) && (
              <div className="mt-2 pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  <strong>Note:</strong> Barrier options payoff is simplified for visualization. 
                  Actual payoff depends on whether barriers are breached during the option's lifetime.
                </p>
              </div>
            )}
          </div>
          
          {/* Detailed risk analysis */}
          {showRiskMetrics && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium mb-3 text-blue-800">Risk Analysis</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="font-medium text-blue-700">Profit Probability</div>
                  <div className="text-blue-600">
                    {((profitZone.length / chartData.length) * 100).toFixed(1)}% of price range
                  </div>
                </div>
                <div>
                  <div className="font-medium text-blue-700">Loss Probability</div>
                  <div className="text-blue-600">
                    {((lossZone.length / chartData.length) * 100).toFixed(1)}% of price range
                  </div>
                </div>
                <div>
                  <div className="font-medium text-blue-700">Strategy Type</div>
                  <div className="text-blue-600">
                    {maxPayoff > Math.abs(minPayoff) ? 'Bullish Bias' : 
                     Math.abs(minPayoff) > maxPayoff ? 'Bearish Bias' : 'Neutral'}
                  </div>
                </div>
              </div>
              
              {breakEvenPoints.length > 1 && (
                <div className="mt-3 pt-3 border-t border-blue-200">
                  <div className="font-medium text-blue-700 mb-1">Multiple Break-even Points:</div>
                  <div className="text-blue-600 text-xs">
                    {breakEvenPoints.map((point, idx) => point.price.toFixed(4)).join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default PayoffChart; 