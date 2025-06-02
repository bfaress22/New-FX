import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "bloomberg" | "system";

// Type pour la fenêtre globale
declare global {
  interface Window {
    __THEME_INIT__?: Theme;
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // Utiliser la valeur initiale définie par le script, si disponible
    if (typeof window !== 'undefined' && window.__THEME_INIT__) {
      return window.__THEME_INIT__;
    }
    // Sinon, récupérer le thème du localStorage
    return (localStorage.getItem("theme") as Theme) || "system";
  });
  
  useEffect(() => {
    // Fonction pour gérer les changements de thème
    const applyTheme = (newTheme: Theme) => {
      const root = window.document.documentElement;
      
      // Supprimer toutes les classes de thème
      root.classList.remove("light", "dark", "bloomberg-theme");
      
      // Gérer les préférences système
      if (newTheme === "system") {
        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        root.classList.add(systemTheme);
        return;
      }
      
      // Appliquer le nouveau thème
      if (newTheme === "bloomberg") {
        root.classList.add("dark", "bloomberg-theme"); // Bloomberg est basé sur le thème dark avec des modifications
      } else {
        root.classList.add(newTheme);
      }
    };
    
    // Enregistrer le thème dans localStorage
    localStorage.setItem("theme", theme);
    applyTheme(theme);
    
    // Ajouter un écouteur pour les changements de préférences système
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };
    
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme]);

  return { theme, setTheme };
} 