import React from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { SavedScenario } from '../types/Scenario';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface Props {
  scenarios: SavedScenario[];
  selectedScenarios: string[];
  setSelectedScenarios: (ids: string[]) => void;
}

const ScenariosPdfExport = ({ scenarios, selectedScenarios, setSelectedScenarios }: Props) => {
  const toggleScenario = (id: string) => {
    setSelectedScenarios(
      selectedScenarios.includes(id)
        ? selectedScenarios.filter(s => s !== id)
        : [...selectedScenarios, id]
    );
  };

  const toggleAll = () => {
    setSelectedScenarios(
      selectedScenarios.length === scenarios.length
        ? []
        : scenarios.map(s => s.id)
    );
  };

  const exportToPdf = async () => {
    const pdf = new jsPDF({
      orientation: 'p',
      unit: 'mm',
      format: 'a4',
      putOnlyUsedFonts: true,
      compress: true
    });

    // Filter selected scenarios
    const scenariosToExport = scenarios.filter(s => selectedScenarios.includes(s.id));
    
    const contentPadding = 10; // Marge intérieure réduite
    let yOffset = contentPadding;
    
    // Options générales pour les tableaux
    const tableOptions = {
      headStyles: { 
        fillColor: [60, 60, 80],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        minCellWidth: 10
      },
      alternateRowStyles: {
        fillColor: [245, 245, 250]
      },
      margin: { 
        left: contentPadding,
        right: contentPadding
      },
      tableWidth: 'auto'
    };

    for (const scenario of scenariosToExport) {
      // Start a new page for each scenario
      if (scenario !== scenariosToExport[0]) {
        pdf.addPage();
        yOffset = contentPadding;
      }

      // En-tête du document
      const pageWidth = pdf.internal.pageSize.width;
      pdf.setFillColor(60, 60, 80);
      pdf.rect(0, 0, pageWidth, 20, 'F');
      
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255);
      pdf.setFontSize(14);
      pdf.text(scenario.name, pageWidth / 2, 12, { align: 'center' });
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text(`Generated on: ${new Date(scenario.timestamp).toLocaleDateString()}`, pageWidth / 2, 18, { align: 'center' });
      
      yOffset = 25;

      // Paramètres principaux et stress test côte à côte
      pdf.setTextColor(0);
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Strategy Overview', contentPadding, yOffset);
      yOffset += 6;
      
      const halfWidth = (pageWidth - (3 * contentPadding)) / 2;
      
      // Tableau des paramètres de base (colonne de gauche)
      const basicParams = [
        ['Parameter', 'Value'],
        ['Start Date', scenario.params.startDate],
        ['Months to Hedge', scenario.params.monthsToHedge.toString()],
        ['Interest Rate', `${scenario.params.interestRate}%`],
        ['Total Volume', scenario.params.totalVolume.toString()],
        ['Spot Price', scenario.params.spotPrice.toFixed(2)]
      ];

      (pdf as any).autoTable({
        ...tableOptions,
        startY: yOffset,
        head: [basicParams[0]],
        body: basicParams.slice(1),
        margin: { left: contentPadding },
        tableWidth: halfWidth
      });

      // Tableau des paramètres de stress test (colonne de droite) si disponible
      if (scenario.stressTest) {
        const stressParams = [
          ['Parameter', 'Value'],
          ['Scenario Type', scenario.stressTest.name],
          ['Volatility', `${(scenario.stressTest.volatility * 100).toFixed(1)}%`],
          ['Drift', `${(scenario.stressTest.drift * 100).toFixed(1)}%`],
          ['Price Shock', `${(scenario.stressTest.priceShock * 100).toFixed(1)}%`]
        ];

        if (scenario.stressTest.forwardBasis) {
          stressParams.push(['Forward Basis', `${(scenario.stressTest.forwardBasis * 100).toFixed(2)}%`]);
        }
        
        if (scenario.stressTest.realBasis) {
          stressParams.push(['Real Basis', `${(scenario.stressTest.realBasis * 100).toFixed(2)}%`]);
        }

        (pdf as any).autoTable({
          ...tableOptions,
          startY: yOffset,
          head: [stressParams[0]],
          body: stressParams.slice(1),
          margin: { left: contentPadding * 2 + halfWidth },
          tableWidth: halfWidth
        });
      }
      
      // Récupérer le nouvel offset Y après les tableaux
      const finalY = Math.max(
        (pdf as any).lastAutoTable.finalY,
        (pdf as any).autoTable.previous?.finalY || 0
      );
      yOffset = finalY + 10;
      
      // Composants de la stratégie
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Strategy Components', contentPadding, yOffset);
      yOffset += 6;

      const strategyData = scenario.strategy.map(opt => {
        const row = [
        opt.type,
          opt.strikeType === 'percent' 
            ? `${opt.strike}% (${(opt.strike * scenario.params.spotPrice / 100).toFixed(2)})` 
            : `${opt.strike.toFixed(2)} (${(opt.strike / scenario.params.spotPrice * 100).toFixed(2)}%)`,
        `${opt.volatility}%`,
        `${opt.quantity}%`
        ];
        
        // Ajouter les informations de barrière si présentes
        if (opt.barrier) {
          const barrierValue = opt.barrierType === 'percent'
            ? `${opt.barrier}% (${(opt.barrier * scenario.params.spotPrice / 100).toFixed(2)})`
            : `${opt.barrier.toFixed(2)} (${(opt.barrier / scenario.params.spotPrice * 100).toFixed(2)}%)`;
          row.push(barrierValue);
        } else {
          row.push('N/A');
        }
        
        return row;
      });

      (pdf as any).autoTable({
        ...tableOptions,
        startY: yOffset,
        head: [['Type', 'Strike', 'Volatility', 'Quantity', 'Barrier']],
        body: strategyData,
        styles: { 
          overflow: 'linebreak',
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 'auto' },
          4: { cellWidth: 'auto' }
        }
      });
      
      yOffset = (pdf as any).lastAutoTable.finalY + 10;

      // Add Summary Statistics on a new page
      pdf.addPage();
      yOffset = 20;
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Summary Statistics', 20, yOffset);
      pdf.setFont('helvetica', 'normal');
      yOffset += 10;

      const totalPnL = scenario.results.reduce((sum, row) => sum + row.deltaPnL, 0);
      const totalUnhedgedCost = scenario.results.reduce((sum, row) => sum + row.unhedgedCost, 0);
      const costReduction = ((totalPnL / Math.abs(totalUnhedgedCost)) * 100).toFixed(2);
      const totalHedgedCost = scenario.results.reduce((sum, row) => sum + row.hedgedCost, 0);
      const totalVolume = scenario.results.reduce((sum, row) => sum + row.monthlyVolume, 0);
      const strikeTarget = totalVolume > 0 ? (totalHedgedCost / totalVolume).toFixed(2) : 'N/A';
      const totalStrategyPremium = scenario.results.reduce(
        (sum, row) => sum + (row.strategyPrice * row.monthlyVolume), 0
      );

      const summaryStats = [
        ['Metric', 'Value'],
        ['Total Cost with Hedging', totalHedgedCost.toFixed(2)],
        ['Total Cost without Hedging', totalUnhedgedCost.toFixed(2)],
        ['Total P&L', totalPnL.toFixed(2)],
        ['Total Strategy Premium', totalStrategyPremium.toFixed(2)],
        ['Cost Reduction', `${costReduction}%`],
        ['Strike Target', strikeTarget]
      ];

      (pdf as any).autoTable({
        headStyles: { 
          fillColor: [60, 60, 80],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center'
        },
        alternateRowStyles: {
          fillColor: [240, 240, 245]
        },
        startY: yOffset,
        head: [summaryStats[0]],
        body: summaryStats.slice(1),
        columnStyles: {
          0: { 
            fontStyle: 'bold',
            cellWidth: 80
          },
          1: { 
            halign: 'right',
            cellWidth: 'auto'
          }
        },
        tableWidth: 'auto',
        margin: { left: 20 }
      });
      
      yOffset = (pdf as any).lastAutoTable.finalY + 10;
      
      // Vérifier si on a besoin d'une nouvelle page pour les graphiques
      if (yOffset > pdf.internal.pageSize.height - 60) {
        pdf.addPage();
        yOffset = contentPadding;
      }
      
      // Graphiques
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Performance Charts', contentPadding, yOffset);
      yOffset += 6;

      // Calculer les dimensions des graphiques
      const usableWidth = pageWidth - (2 * contentPadding);
      const aspectRatio = 1.8; // Ratio largeur:hauteur (optimisé pour les graphiques)
      const chartHeight = usableWidth / aspectRatio;
      
      try {
        // Graphique P&L Evolution
        const chartElement = document.getElementById(`pnl-chart-${scenario.id}`);
        if (chartElement) {
          const renderOptions = {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          };
          
          const canvas = await html2canvas(chartElement, renderOptions);
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', contentPadding, yOffset, usableWidth, chartHeight);
          yOffset += chartHeight + 5; // Espace réduit entre les graphiques
        }
        
        // Vérifier si on a besoin d'une nouvelle page pour le deuxième graphique
        if (yOffset > pdf.internal.pageSize.height - chartHeight - 20) {
          pdf.addPage();
          yOffset = contentPadding;
        }
        
        // Graphique Payoff
        const payoffElement = document.getElementById(`payoff-chart-${scenario.id}`);
        if (payoffElement) {
          const renderOptions = {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
          };
          
          const canvas = await html2canvas(payoffElement, renderOptions);
          const imgData = canvas.toDataURL('image/png');
          pdf.addImage(imgData, 'PNG', contentPadding, yOffset, usableWidth, chartHeight);
          yOffset += chartHeight + 10;
        }
      } catch (error) {
        console.error('Error rendering charts:', error);
        pdf.text('Error rendering charts', contentPadding, yOffset);
        yOffset += 10;
      }
      
      // Add Monthly & Yearly P&L Breakdown on a new page
      pdf.addPage();
      yOffset = 20;
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Monthly & Yearly P&L Breakdown', 20, yOffset);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      yOffset += 8;
      pdf.text('Values shown in thousands', 20, yOffset);
      yOffset += 15;
      
      // Organiser les données par année et par mois
      const pnlByYearMonth: Record<string, Record<string, number>> = {};
      const yearTotals: Record<string, number> = {};
      const monthTotals: Record<string, number> = {};
      let grandTotal = 0;
      const months: string[] = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      
      // Initialiser les totaux mensuels
      months.forEach(month => {
        monthTotals[month] = 0;
      });
      
      // Collecter les données
      scenario.results.forEach(result => {
        try {
          const date = new Date(result.date);
          const year = date.getFullYear().toString();
          const month = date.getMonth();
          const monthKey = months[month];
          
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
          monthTotals[monthKey] += result.deltaPnL;
          grandTotal += result.deltaPnL;
        } catch (error) {
          console.error('Erreur lors du traitement de la date:', result.date, error);
        }
      });
      
      // Convertir l'ensemble des années en tableau trié
      const sortedYears = Array.from(Object.keys(pnlByYearMonth)).sort();
      
      // Fonction pour formater les valeurs de P&L
      const formatPnLForPdf = (value: number) => {
        // Simplifier le formatage pour éviter les problèmes d'affichage dans le PDF
        return value.toFixed(1);
      };
      
      // Préparer les données pour le tableau
      const monthlyPnLData = sortedYears.map(year => {
        const rowData: any[] = [year];
        
        months.forEach(month => {
          const value = pnlByYearMonth[year][month] || 0;
          rowData.push(value === 0 ? '-' : formatPnLForPdf(value));
        });
        
        rowData.push(formatPnLForPdf(yearTotals[year])); // Total annuel
        return rowData;
      });
      
      // Ajouter une ligne de total pour chaque mois
      const monthlyTotals = ['Total'];
      
      months.forEach((month) => {
        const monthTotal = monthTotals[month];
        monthlyTotals.push(monthTotal === 0 ? '-' : formatPnLForPdf(monthTotal));
      });
      
      monthlyTotals.push(formatPnLForPdf(grandTotal)); // Total général
      monthlyPnLData.push(monthlyTotals);
      
      const monthlyHeaders = ['Year'].concat(months).concat(['Total']);
      
      (pdf as any).autoTable({
        ...tableOptions,
        startY: yOffset,
        head: [monthlyHeaders],
        body: monthlyPnLData,
        styles: { 
          overflow: 'linebreak',
          cellPadding: 3,
          fontSize: 8 // Réduire la taille de police pour que tout rentre
        },
        columnStyles: { 
          0: { fontStyle: 'bold', halign: 'left' },
          13: { fontStyle: 'bold', halign: 'right' }
        },
        didParseCell: function(data: any) {
          // Styles conditionnels pour les valeurs positives/négatives
          if (data.section === 'body' && data.column.index > 0) {
            const value = data.cell.raw;
            
            if (value === '-') return;
            
            try {
              const numValue = typeof value === 'string' 
                ? parseFloat(value.replace(',', '.')) 
                : value;
              
              if (numValue > 0) {
                data.cell.styles.fillColor = [230, 255, 230];
              } else if (numValue < 0) {
                data.cell.styles.fillColor = [255, 230, 230];
              }
            } catch (e) {
              console.error('Erreur lors du formatage de la cellule:', e);
            }
          }
        }
      });
      
      yOffset = (pdf as any).lastAutoTable.finalY + 10;
      
      // Statistics by Year
      pdf.setFontSize(12);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Summary Statistics by Year', contentPadding, yOffset);
      yOffset += 6;

      // Calculate yearly statistics
      const yearlyResults = sortedYears.map(year => {
        const yearData = scenario.results.filter(r => {
          try {
            const date = new Date(r.date);
            return date.getFullYear().toString() === year;
          } catch (e) {
            return false;
          }
        });
        
        const hedgedCost = yearData.reduce((sum, row) => sum + row.hedgedCost, 0);
        const unhedgedCost = yearData.reduce((sum, row) => sum + row.unhedgedCost, 0);
        const deltaPnL = yearData.reduce((sum, row) => sum + row.deltaPnL, 0);
        const strategyPremium = yearData.reduce((sum, row) => sum + (row.strategyPrice * row.monthlyVolume), 0);
        const volume = yearData.reduce((sum, row) => sum + row.monthlyVolume, 0);
        const strikeTarget = volume > 0 ? (hedgedCost / volume).toFixed(2) : 'N/A';
        const costReduction = ((deltaPnL / Math.abs(unhedgedCost)) * 100).toFixed(2);
        
        return [
          year,
          hedgedCost.toFixed(0),
          unhedgedCost.toFixed(0),
          deltaPnL.toFixed(0),
          strategyPremium.toFixed(0),
          strikeTarget,
          `${costReduction}%`
        ];
      });
      
      (pdf as any).autoTable({
        ...tableOptions,
        startY: yOffset,
        head: [['Year', 'Hedged Cost', 'Unhedged Cost', 'Delta P&L', 'Strategy Premium', 'Strike Target', 'Cost Reduction (%)']],
        body: yearlyResults,
        styles: {
          fontSize: 9 // Taille de police réduite pour adapter le contenu
        },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right' },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' }
        },
        didParseCell: function(data: any) {
          // Mettre en surbrillance les valeurs de P&L
          if (data.section === 'body' && data.column.index === 3) {
            try {
              const value = data.cell.raw;
              const numValue = typeof value === 'string' 
                ? parseFloat(value.replace(/,/g, ''))
                : value;
              
              if (numValue > 0) {
                data.cell.styles.fillColor = [230, 255, 230];
              } else if (numValue < 0) {
                data.cell.styles.fillColor = [255, 230, 230];
              }
            } catch (e) {
              console.error('Erreur lors du formatage de la cellule:', e);
            }
          }
        }
      });

      // Add Detailed Results on a new page
      pdf.addPage();
      yOffset = 20;
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold'); 
      pdf.text('Detailed Results', 20, yOffset);
      pdf.setFont('helvetica', 'normal');
      yOffset += 10;
      
      const detailedResults = scenario.results.map(row => [
        row.date,
        row.forward.toFixed(2),
        row.realPrice.toFixed(2),
        row.strategyPrice.toFixed(2),
        row.totalPayoff.toFixed(2),
        row.hedgedCost.toFixed(0),
        row.unhedgedCost.toFixed(0),
        row.deltaPnL.toFixed(0)
      ]);

      (pdf as any).autoTable({
        headStyles: { 
          fillColor: [60, 60, 80],
          textColor: 255,
          fontStyle: 'bold',
          halign: 'center'
        },
        alternateRowStyles: {
          fillColor: [240, 240, 245]
        },
        startY: yOffset,
        head: [['Date', 'Forward', 'Real Price', 'Strategy Price', 'Payoff', 'Hedged Cost', 'Unhedged Cost', 'Delta P&L']],
        body: detailedResults,
        styles: {
          fontSize: 8,
          cellPadding: 2
        },
        columnStyles: {
          0: { cellWidth: 'auto' },
          1: { cellWidth: 'auto', halign: 'right' },
          2: { cellWidth: 'auto', halign: 'right' },
          3: { cellWidth: 'auto', halign: 'right' },
          4: { cellWidth: 'auto', halign: 'right' },
          5: { cellWidth: 'auto', halign: 'right' },
          6: { cellWidth: 'auto', halign: 'right' },
          7: { cellWidth: 'auto', halign: 'right' }
        },
        didParseCell: function(data) {
          // Mettre en surbrillance les valeurs de P&L
          if (data.section === 'body' && data.column.index === 7) {
            try {
              const value = data.cell.raw;
              const numValue = typeof value === 'string' 
                ? parseFloat(value.replace(/,/g, ''))
                : value;
              
              if (numValue > 0) {
                data.cell.styles.fillColor = [230, 255, 230];
              } else if (numValue < 0) {
                data.cell.styles.fillColor = [255, 230, 230];
              }
            } catch (e) {
              console.error('Erreur lors du formatage de la cellule:', e);
            }
          }
        },
        margin: { left: 10, right: 10 }
      });
      
      // Ajouter un pied de page à toutes les pages
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(100);
        pdf.text(
          `${scenario.name} - Page ${i} of ${totalPages}`, 
          pageWidth / 2, 
          pdf.internal.pageSize.height - 5, 
          { align: 'center' }
        );
      }
    }

    // Save the PDF
    pdf.save('options-scenarios.pdf');
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-4 mb-4">
        <Checkbox
          checked={selectedScenarios.length === scenarios.length}
          onCheckedChange={toggleAll}
          id="select-all"
        />
        <label htmlFor="select-all">Select All Scenarios</label>
        <Button
          onClick={exportToPdf}
          disabled={selectedScenarios.length === 0}
        >
          Export Selected to PDF
        </Button>
      </div>
      <div className="space-y-2">
        {scenarios.map(scenario => (
          <div key={scenario.id} className="flex items-center gap-2">
            <Checkbox
              checked={selectedScenarios.includes(scenario.id)}
              onCheckedChange={() => toggleScenario(scenario.id)}
              id={`scenario-${scenario.id}`}
            />
            <label htmlFor={`scenario-${scenario.id}`}>
              {scenario.name} ({new Date(scenario.timestamp).toLocaleDateString()})
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScenariosPdfExport; 