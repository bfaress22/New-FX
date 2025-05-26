# Enhanced PayoffChart Component

## Overview
The `PayoffChart` component provides a sophisticated visualization of FX options strategy payoffs inspired by professional trading platforms. It offers comprehensive risk analysis and interactive features for better strategy understanding.

## Features

### 📊 Interactive Chart
- **Recharts-based** modern line chart with smooth animations
- **Custom tooltip** showing detailed information including currency pair context
- **Reference lines** for current spot, break-even, strikes, and barriers
- **Responsive design** that adapts to different screen sizes

### 🎯 Reference Lines
- **Current Spot**: Gray dashed line showing current exchange rate
- **Break-even**: Horizontal line at Y=0 for profit/loss threshold
- **Strike Lines**: Green dashed lines for option strike prices
- **Barrier Lines**: 
  - Red lines for Knock-Out barriers
  - Blue lines for Knock-In barriers
  - Support for double barrier options

### 📈 Risk Metrics Dashboard
- **Max Profit/Loss**: Clearly displayed in colored boxes
- **Break-even Points**: Automatic detection and display
- **Risk/Reward Ratio**: Calculated risk-to-reward ratio
- **Profit/Loss Probability**: Percentage of price range in profit/loss zones
- **Strategy Bias**: Automatic detection (Bullish/Bearish/Neutral)

### ⚙️ Interactive Controls
- **Include Premium Toggle**: Switch between gross and net payoff display
- **Risk Analysis Toggle**: Show/hide detailed risk metrics
- **Responsive Layout**: Adapts to mobile and desktop screens

## Usage

```tsx
<PayoffChart
  data={payoffData}
  strategy={strategy}
  spot={params.spotPrice}
  currencyPair={params.currencyPair}
  includePremium={true}
  className="mt-6"
/>
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `data` | `Array<{price: number, payoff: number}>` | Payoff calculation data points |
| `strategy` | `StrategyComponent[]` | Array of strategy components (options, swaps, etc.) |
| `spot` | `number` | Current spot price for reference line |
| `currencyPair` | `CurrencyPair` | Currency pair information for labeling |
| `includePremium` | `boolean` | Whether to include premium in calculations (optional) |
| `className` | `string` | Additional CSS classes (optional) |

## Strategy Support

### ✅ Supported Strategy Types
- **Vanilla Options**: Calls and Puts
- **Barrier Options**: 
  - Knock-Out (KO) and Knock-In (KI)
  - Reverse barriers
  - Double barrier options
- **Forwards**: FX forward contracts
- **Swaps**: Currency swaps
- **Complex Strategies**: Multi-leg combinations

### 🔄 Automatic Detection
- Strategy composition analysis
- Barrier level identification
- Risk profile classification
- Break-even calculation

## Enhanced Features

### 🎨 Professional Styling
- **Color-coded metrics**: Green for profit, red for loss, blue for neutral
- **Bloomberg-inspired design**: Professional trading platform aesthetics
- **Consistent theming**: Integrates with shadcn/ui design system

### 📊 Advanced Analytics
- **Monte Carlo ready**: Compatible with simulation data
- **Risk decomposition**: Detailed risk analysis by price zones
- **Multiple break-evens**: Support for complex strategies with multiple break-even points

### 🔍 Detailed Information
- **Strategy summary**: Automatic composition breakdown
- **Barrier notes**: Educational information about barrier option behavior
- **Currency context**: Base/quote currency labeling

## Technical Implementation

### Dependencies
- `recharts`: Modern charting library
- `shadcn/ui`: Component library for consistent styling
- `React`: Hooks for state management

### Performance
- **Optimized rendering**: Efficient data processing
- **Responsive calculations**: Real-time metric updates
- **Memory efficient**: Minimal re-renders

## Examples

### Simple Call Option
```tsx
// Single EUR/USD call option at 1.10 strike
const strategy = [
  {
    type: 'call',
    strike: 110,
    strikeType: 'percent',
    volatility: 20,
    quantity: 100
  }
];
```

### Barrier Strategy
```tsx
// EUR/USD knock-out call with barrier at 1.15
const strategy = [
  {
    type: 'call-knockout',
    strike: 110,
    strikeType: 'percent',
    barrier: 115,
    barrierType: 'percent',
    volatility: 20,
    quantity: 100
  }
];
```

## Future Enhancements
- **P&L attribution**: Breakdown by Greeks (Delta, Gamma, Theta, Vega)
- **Scenario analysis**: What-if scenarios with parameter adjustments
- **Export functionality**: PDF/PNG export of charts
- **Historical overlay**: Compare with historical data 