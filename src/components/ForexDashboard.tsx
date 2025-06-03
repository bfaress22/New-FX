import React, { useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const ForexDashboard: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoaded = useRef<boolean>(false);

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
      <CardContent className="pt-4">
        <div className="h-[800px]">
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