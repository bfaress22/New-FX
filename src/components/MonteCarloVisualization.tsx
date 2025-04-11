import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Download } from 'lucide-react';

export interface SimulationData {
  realPricePaths: number[][];
  timeLabels: string[];
  strategyName: string;
}

interface MonteCarloVisualizationProps {
  simulationData: SimulationData | null;
}

const MonteCarloVisualization: React.FC<MonteCarloVisualizationProps> = ({ simulationData }) => {
  const realPriceChartRef = useRef<HTMLCanvasElement | null>(null);
  const realPriceChartInstance = useRef<Chart | null>(null);

  const getRandomColor = () => {
    const opacity = 0.2 + Math.random() * 0.3; // Random opacity between 0.2 and 0.5
    return `rgba(${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${opacity})`;
  };

  const renderRealPriceChart = () => {
    if (!simulationData || !realPriceChartRef.current || simulationData.realPricePaths.length === 0) return;
    
    // Destroy existing chart if it exists
    if (realPriceChartInstance.current) {
      realPriceChartInstance.current.destroy();
    }

    const ctx = realPriceChartRef.current.getContext('2d');
    if (!ctx) return;

    const datasets = simulationData.realPricePaths.map((path, index) => {
      const color = getRandomColor();
      return {
        label: `Path ${index + 1}`,
        data: path,
        borderColor: color,
        borderWidth: 1,
        fill: false,
        pointRadius: 0,
        showLine: true,
      };
    });

    realPriceChartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: simulationData.timeLabels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Monte Carlo Simulation - Price Paths',
            font: {
              size: 16,
              weight: 'bold',
            },
            color: '#2563eb', // Match primary color
          },
          legend: {
            display: false,
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleFont: {
              size: 12,
              weight: 'bold',
            },
            bodyFont: {
              size: 11,
            },
            padding: 8,
            cornerRadius: 6,
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time',
              font: {
                size: 12,
                weight: 'normal',
              },
            },
            grid: {
              display: true,
              color: 'rgba(0, 0, 0, 0.05)',
            },
          },
          y: {
            title: {
              display: true,
              text: 'Price',
              font: {
                size: 12,
                weight: 'normal',
              },
            },
            grid: {
              display: true,
              color: 'rgba(0, 0, 0, 0.05)',
            },
          },
        },
        animation: {
          duration: 0, // Disable animation for better performance
        },
      },
    });
  };

  useEffect(() => {
    if (simulationData && simulationData.realPricePaths.length > 0) {
      renderRealPriceChart();
    }
  }, [simulationData]);

  if (!simulationData) {
    return (
      <Card className="w-full shadow-md border border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-primary">Monte Carlo Simulation</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">No simulation data available. Run a simulation first.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full shadow-md border border-border/60">
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-lg font-semibold text-primary">Monte Carlo Simulation - {simulationData.strategyName}</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">Visualization of price paths from Monte Carlo simulation</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium mb-3 text-foreground/80">Price Paths</h3>
            <div className="h-[400px] rounded-lg overflow-hidden bg-muted/20 p-2">
              <canvas ref={realPriceChartRef} />
            </div>
          </div>

          <div className="flex justify-end mt-2">
            <Button 
              variant="outline"
              size="sm"
              className="flex items-center gap-1 text-xs"
              onClick={() => {
                if (window.confirm('Download Price Paths chart as image?')) {
                  if (realPriceChartRef.current) {
                    const image = realPriceChartRef.current.toDataURL('image/png');
                    const link = document.createElement('a');
                    link.download = 'monte-carlo-price-paths.png';
                    link.href = image;
                    link.click();
                  }
                }
              }}
            >
              <Download size={14} />
              Download Chart
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MonteCarloVisualization; 