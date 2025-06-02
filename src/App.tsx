import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./hooks/ThemeProvider";
import Index from "./pages/Index";
import SavedScenarios from "./pages/SavedScenarios";
import NotFound from "./pages/NotFound";
import { ThemeToggle } from "./components/ui/theme-toggle";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <div className="fixed top-4 right-4 z-50">
          <ThemeToggle />
        </div>
        <Router>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/saved" element={<SavedScenarios />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Router>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
