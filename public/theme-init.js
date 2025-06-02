// Script pour initialiser le thème avant le rendu React
(function() {
  function getInitialTheme() {
    // Récupérer le thème depuis localStorage, s'il existe
    const storedTheme = localStorage.getItem('theme');
    
    if (storedTheme) {
      return storedTheme;
    }
    
    // Sinon, utiliser la préférence système
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  
  function applyTheme(theme) {
    const root = document.documentElement;
    
    // Supprimer toutes les classes de thème
    root.classList.remove('light', 'dark', 'bloomberg-theme');
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
      return;
    }
    
    // Appliquer le thème
    if (theme === 'bloomberg') {
      root.classList.add('dark', 'bloomberg-theme');
    } else {
      root.classList.add(theme);
    }
  }
  
  const initialTheme = getInitialTheme();
  applyTheme(initialTheme);
  
  // Ajouter cette information au window pour que le React puisse la récupérer
  window.__THEME_INIT__ = initialTheme;
})(); 