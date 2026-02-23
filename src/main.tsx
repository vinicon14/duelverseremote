/**
 * DuelVerse - Plataforma de Duelos Online Yu-Gi-Oh!
 * Desenvolvido por Vinícius
 * 
 * Ponto de entrada da aplicação React.
 * Renderiza o componente App dentro do elemento root do DOM.
 */
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
