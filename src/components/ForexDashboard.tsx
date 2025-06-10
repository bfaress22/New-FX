import React, { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { CURRENCY_PAIRS } from '@/pages/Index';

interface ForexDashboardProps {
  onRateSelected?: (pair: string, rate: number) => void;
  currentPair?: string;
}

const ForexDashboard: React.FC<ForexDashboardProps> = ({ onRateSelected, currentPair }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoaded = useRef<boolean>(false);
  const [selectedPair, setSelectedPair] = useState<string>(currentPair || "EUR/USD");
  const [currentRate, setCurrentRate] = useState<number>(
    CURRENCY_PAIRS.find(p => p.symbol === (currentPair || "EUR/USD"))?.defaultSpotRate || 1.085
  );
  const [autoSync, setAutoSync] = useState<boolean>(false);

  // Fonction pour simuler une mise à jour du taux (pourrait être remplacée par des données réelles)
  const updateRate = () => {
    // Dans une application réelle, cette fonction ferait un appel API pour obtenir le taux de change actuel
    // Pour notre démonstration, nous appliquons une légère variation aléatoire
    const pair = CURRENCY_PAIRS.find(p => p.symbol === selectedPair);
    if (pair) {
      const baseRate = pair.defaultSpotRate;
      const variation = (Math.random() - 0.5) * 0.01; // Variation de ±0.5%
      const newRate = baseRate + baseRate * variation;
      setCurrentRate(parseFloat(newRate.toFixed(5)));
    }
  };

  // Appliquer le taux sélectionné aux paramètres
  const applyRate = () => {
    if (onRateSelected) {
      onRateSelected(selectedPair, currentRate);
    }
  };

  // Mettre à jour automatiquement le taux si autoSync est activé
  useEffect(() => {
    if (autoSync) {
      const interval = setInterval(() => {
        updateRate();
        applyRate();
      }, 5000); // Mise à jour toutes les 5 secondes
      return () => clearInterval(interval);
    }
  }, [autoSync, selectedPair, currentRate]);

  useEffect(() => {
    if (containerRef.current && !scriptLoaded.current) {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-screener.js';
      script.async = true;
      script.type = 'text/javascript';
      
      // Configuration du widget
      script.innerHTML = JSON.stringify({
        width: '100%',
        height: '100%',
        defaultColumn: 'overview',
        defaultScreen: 'top_gainers',
        showToolbar: true,
        locale: 'en',
        market: 'forex',
        colorTheme: 'light'
      });

      // Créer les éléments nécessaires pour le widget
      const widgetContainer = document.createElement('div');
      widgetContainer.className = 'tradingview-widget-container__widget';
      
      const copyrightDiv = document.createElement('div');
      copyrightDiv.className = 'tradingview-widget-copyright';
      
      const copyrightLink = document.createElement('a');
      copyrightLink.href = 'https://www.tradingview.com/';
      copyrightLink.rel = 'noopener nofollow';
      copyrightLink.target = '_blank';
      
      const blueText = document.createElement('span');
      blueText.className = 'blue-text';
      blueText.textContent = 'Track all markets on TradingView';
      
      copyrightLink.appendChild(blueText);
      copyrightDiv.appendChild(copyrightLink);
      
      // Nettoyer le conteneur et ajouter les nouveaux éléments
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
        containerRef.current.appendChild(widgetContainer);
        containerRef.current.appendChild(copyrightDiv);
        containerRef.current.appendChild(script);
      }
      
      scriptLoaded.current = true;
    }
    
    return () => {
      // Nettoyer le script lorsque le composant est démonté
      if (containerRef.current) {
        const scripts = containerRef.current.getElementsByTagName('script');
        if (scripts.length > 0) {
          for (let i = 0; i < scripts.length; i++) {
            containerRef.current.removeChild(scripts[i]);
          }
        }
      }
    };
  }, []);

  return (
    <Card className="shadow-md w-full">
      <CardHeader className="pb-2 border-b">
        <CardTitle className="text-xl font-bold text-primary">Forex Market Dashboard</CardTitle>
      </CardHeader>
      
      <CardContent className="py-4">
        <div className="mb-6 p-4 bg-muted/30 rounded-md border">
          <h3 className="text-lg font-medium mb-3">Fast Currency Rate Sync</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="pair-select">Select Currency Pair</Label>
              <Select 
                value={selectedPair} 
                onValueChange={setSelectedPair}
              >
                <SelectTrigger id="pair-select" className="w-full">
                  <SelectValue placeholder="Select pair" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_PAIRS.map(pair => (
                    <SelectItem key={pair.symbol} value={pair.symbol}>
                      {pair.symbol} - {pair.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="current-rate">Current Rate</Label>
              <div className="flex items-center space-x-2">
                <Input 
                  id="current-rate"
                  type="number"
                  value={currentRate} 
                  onChange={(e) => setCurrentRate(Number(e.target.value))}
                  className="flex-1"
                  step="0.00001"
                />
                <Button 
                  size="icon"
                  variant="outline"
                  onClick={updateRate}
                  title="Refresh rate"
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <div className="flex flex-col justify-end">
              <Button onClick={applyRate} className="w-full">
                Apply Rate to Parameters
              </Button>
              
              <div className="flex items-center space-x-2 mt-2">
                <Switch
                  id="auto-sync"
                  checked={autoSync}
                  onCheckedChange={setAutoSync}
                />
                <Label htmlFor="auto-sync">Auto-sync (every 5s)</Label>
              </div>
            </div>
          </div>
          
          {autoSync && (
            <div className="mt-3 flex items-center text-sm text-amber-600">
              <AlertCircle className="h-4 w-4 mr-1" />
              <span>Auto-sync is active. Rate will update automatically.</span>
            </div>
          )}
        </div>
        
        <div className="h-[650px]">
          <div className="tradingview-widget-container h-full" ref={containerRef}>
            <div className="tradingview-widget-container__widget"></div>
            <div className="tradingview-widget-copyright">
              <a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank">
                <span className="blue-text">Track all markets on TradingView</span>
              </a>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ForexDashboard; 