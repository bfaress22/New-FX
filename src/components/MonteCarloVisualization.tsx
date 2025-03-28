import React, { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

export interface SimulationData {
  realPricePaths: number[][];
  barrierOptionPricePaths: number[][];
  timeLabels: string[];
  strategyName: string;
}

interface MonteCarloVisualizationProps {
  simulationData: SimulationData | null;
}

const MonteCarloVisualization: React.FC<MonteCarloVisualizationProps> = ({ simulationData }) => {
  const realPriceChartRef = useRef<HTMLCanvasElement | null>(null);
  const optionPriceChartRef = useRef<HTMLCanvasElement | null>(null);
  const realPriceChartInstance = useRef<Chart | null>(null);
  const optionPriceChartInstance = useRef<Chart | null>(null);

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
            text: 'Monte Carlo Simulation - Real Price Paths',
            font: {
              size: 16,
              weight: 'bold',
            },
          },
          legend: {
            display: false,
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time',
            },
          },
          y: {
            title: {
              display: true,
              text: 'Price',
            },
          },
        },
        animation: {
          duration: 0, // Disable animation for better performance
        },
      },
    });
  };

  const renderOptionPriceChart = () => {
    if (!simulationData || !optionPriceChartRef.current || simulationData.barrierOptionPricePaths.length === 0) return;
    
    // Destroy existing chart if it exists
    if (optionPriceChartInstance.current) {
      optionPriceChartInstance.current.destroy();
    }

    const ctx = optionPriceChartRef.current.getContext('2d');
    if (!ctx) return;

    const datasets = simulationData.barrierOptionPricePaths.map((path, index) => {
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

    optionPriceChartInstance.current = new Chart(ctx, {
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
            text: 'Monte Carlo Simulation - Barrier Option Price Paths',
            font: {
              size: 16,
              weight: 'bold',
            },
          },
          legend: {
            display: false,
          },
          tooltip: {
            mode: 'index',
            intersect: false,
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: 'Time',
            },
          },
          y: {
            title: {
              display: true,
              text: 'Option Price',
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
    if (simulationData) {
      if (simulationData.realPricePaths.length > 0) {
        renderRealPriceChart();
      }
      if (simulationData.barrierOptionPricePaths.length > 0) {
        renderOptionPriceChart();
      }
    }
  }, [simulationData]);

  if (!simulationData) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Monte Carlo Simulation</CardTitle>
          <CardDescription>No simulation data available. Run a simulation first.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardContent>
        <div className="space-y-8">
          {/* Real Price Paths Chart - Only shown if there are real price paths */}
          {simulationData.realPricePaths.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Real Price Paths</h3>
              <div style={{ height: '400px' }}>
                <canvas ref={realPriceChartRef} />
              </div>
            </div>
          )}
          
          {/* Barrier Option Price Paths Chart - Only shown if there are barrier option price paths */}
          {simulationData.barrierOptionPricePaths.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-2">Option Price Paths</h3>
              <div style={{ height: '400px' }}>
                <canvas ref={optionPriceChartRef} />
              </div>
            </div>
          )}

          {/* Download buttons - one for each visible chart */}
          <div className="flex justify-end mt-4 gap-2">
            {simulationData.realPricePaths.length > 0 && (
              <Button 
                onClick={() => {
                  if (window.confirm('Download Real Price Paths chart as image?')) {
                    if (realPriceChartRef.current) {
                      const image = realPriceChartRef.current.toDataURL('image/png');
                      const link = document.createElement('a');
                      link.download = 'monte-carlo-real-price-paths.png';
                      link.href = image;
                      link.click();
                    }
                  }
                }}
              >
                Download Real Price Chart
              </Button>
            )}
            {simulationData.barrierOptionPricePaths.length > 0 && (
              <Button 
                onClick={() => {
                  if (window.confirm('Download Option Price Paths chart as image?')) {
                    if (optionPriceChartRef.current) {
                      const image = optionPriceChartRef.current.toDataURL('image/png');
                      const link = document.createElement('a');
                      link.download = 'monte-carlo-option-price-paths.png';
                      link.href = image;
                      link.click();
                    }
                  }
                }}
              >
                Download Option Price Chart
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default MonteCarloVisualization; 