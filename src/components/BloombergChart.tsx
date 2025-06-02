import React from 'react';
import { useThemeContext } from '@/hooks/ThemeProvider';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';

interface ChartProps {
  data: Array<{ price: number; payoff: number }>;
  spotPrice: number;
  title?: string;
  width?: number | string;
  height?: number | string;
}

export const BloombergChart: React.FC<ChartProps> = ({
  data,
  spotPrice,
  title = "Payoff Profile",
  width = '100%',
  height = 400,
}) => {
  const { theme } = useThemeContext();
  const isBloombergTheme = theme === 'bloomberg';
  
  // Trouver les min et max pour les axes
  const minPrice = Math.min(...data.map(d => d.price));
  const maxPrice = Math.max(...data.map(d => d.price));
  const minPayoff = Math.min(...data.map(d => d.payoff));
  const maxPayoff = Math.max(...data.map(d => d.payoff));
  
  // Calculer un buffer pour les axes (~10% de la plage)
  const priceBuffer = (maxPrice - minPrice) * 0.1;
  const payoffBuffer = (maxPayoff - minPayoff) * 0.1;
  
  // Couleurs Bloomberg vs couleurs standard
  const colors = isBloombergTheme ? {
    background: '#101418',
    grid: '#2a3039',
    line: '#ffa500', // Orange Bloomberg
    spot: '#21a621', // Vert Bloomberg
    axis: '#aaa',
    tooltip: {
      background: '#1e242c',
      border: '#3d4654',
      text: '#fff'
    }
  } : {
    background: theme === 'dark' ? '#121212' : '#fff',
    grid: theme === 'dark' ? '#333' : '#ddd',
    line: theme === 'dark' ? '#4f83f7' : '#3367d6',
    spot: theme === 'dark' ? '#777' : '#777',
    axis: theme === 'dark' ? '#aaa' : '#666',
    tooltip: {
      background: theme === 'dark' ? '#333' : '#fff',
      border: theme === 'dark' ? '#555' : '#ddd',
      text: theme === 'dark' ? '#fff' : '#333'
    }
  };
  
  // Style pour le texte du tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const style = {
        backgroundColor: colors.tooltip.background,
        border: `1px solid ${colors.tooltip.border}`,
        padding: '10px',
        borderRadius: '3px',
        color: colors.tooltip.text,
        fontFamily: isBloombergTheme ? '"Roboto Mono", monospace' : 'inherit',
        fontSize: isBloombergTheme ? '12px' : '14px'
      };
      
      return (
        <div style={style}>
          <p style={{ margin: '0 0 5px 0' }}><strong>Price:</strong> {label.toFixed(2)}</p>
          <p style={{ margin: '0' }}><strong>Payoff:</strong> {payload[0].value.toFixed(2)}</p>
        </div>
      );
    }
    return null;
  };
  
  return (
    <div className={`chart-container ${isBloombergTheme ? 'bloomberg-theme' : ''}`}>
      {title && (
        <h3 className="chart-title" style={{
          color: isBloombergTheme ? '#ffa500' : (theme === 'dark' ? '#fff' : '#333'),
          fontFamily: isBloombergTheme ? '"Roboto", sans-serif' : 'inherit',
          fontSize: isBloombergTheme ? '16px' : '18px',
          fontWeight: 600,
          textTransform: isBloombergTheme ? 'uppercase' : 'none',
          marginBottom: '15px',
          letterSpacing: isBloombergTheme ? '0.5px' : 'normal'
        }}>
          {title}
        </h3>
      )}
      
      <ResponsiveContainer width={width} height={height}>
        <LineChart
          data={data}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          style={{ backgroundColor: colors.background, borderRadius: isBloombergTheme ? '4px' : '8px' }}
        >
          <CartesianGrid 
            stroke={colors.grid}
            strokeDasharray={isBloombergTheme ? "3 3" : "3 3"}
          />
          
          <XAxis
            dataKey="price"
            domain={[minPrice - priceBuffer, maxPrice + priceBuffer]}
            tick={{ fill: colors.axis }}
            tickLine={{ stroke: colors.axis }}
            axisLine={{ stroke: colors.axis }}
            label={{
              value: 'Price',
              position: 'insideBottom',
              offset: -5,
              style: {
                fill: colors.axis,
                fontFamily: isBloombergTheme ? '"Roboto Mono", monospace' : 'inherit',
                fontSize: isBloombergTheme ? '12px' : '14px'
              }
            }}
          />
          
          <YAxis
            domain={[minPayoff - payoffBuffer, maxPayoff + payoffBuffer]}
            tick={{ fill: colors.axis }}
            tickLine={{ stroke: colors.axis }}
            axisLine={{ stroke: colors.axis }}
            label={{
              value: 'Payoff',
              angle: -90,
              position: 'insideLeft',
              style: {
                fill: colors.axis,
                fontFamily: isBloombergTheme ? '"Roboto Mono", monospace' : 'inherit',
                fontSize: isBloombergTheme ? '12px' : '14px'
              }
            }}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          <Legend
            wrapperStyle={{
              fontFamily: isBloombergTheme ? '"Roboto Mono", monospace' : 'inherit',
              fontSize: isBloombergTheme ? '12px' : '14px',
              color: colors.axis
            }}
          />
          
          <ReferenceLine
            x={spotPrice}
            stroke={colors.spot}
            strokeDasharray="3 3"
            label={{
              value: `Spot: ${spotPrice.toFixed(2)}`,
              position: 'top',
              fill: colors.spot,
              fontSize: isBloombergTheme ? '10px' : '12px',
              fontFamily: isBloombergTheme ? '"Roboto Mono", monospace' : 'inherit'
            }}
          />
          
          <ReferenceLine
            y={0}
            stroke={colors.grid}
            strokeWidth={1}
          />
          
          <Line
            type="monotone"
            dataKey="payoff"
            stroke={colors.line}
            strokeWidth={isBloombergTheme ? 2 : 2}
            dot={false}
            activeDot={{ r: 6, stroke: colors.line, strokeWidth: 2, fill: colors.background }}
            name="Strategy Payoff"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}; 