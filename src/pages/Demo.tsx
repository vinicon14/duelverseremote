import React from 'react';
import { EnhancedDuelField } from '../components/game/EnhancedDuelField';

const DemoPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Sistema de Invocação de Cards
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Demonstração do sistema de invocação aprimorado com validação de regras, 
            controle de fases e gerenciamento de tributos para Yu-Gi-Oh!
          </p>
        </div>
        
        <EnhancedDuelField />
        
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4">Recursos Implementados</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h3 className="font-semibold text-blue-900 mb-2">Validação de Zonas</h3>
              <p className="text-sm text-blue-700">
                Cards só podem ser colocados em zonas apropriadas (monstros em zonas de monstro, 
                magias/armadilhas em zonas de magia/armadilha).
              </p>
            </div>
            
            <div className="p-4 bg-green-50 rounded-lg">
              <h3 className="font-semibold text-green-900 mb-2">Controle de Fases</h3>
              <p className="text-sm text-green-700">
                Sistema completo de gerenciamento de fases e turnos com validação de 
                ações permitidas em cada fase.
              </p>
            </div>
            
            <div className="p-4 bg-purple-50 rounded-lg">
              <h3 className="font-semibold text-purple-900 mb-2">Sistema de Tributos</h3>
              <p className="text-sm text-purple-700">
                Cálculo automático de tributos necessários e interface para seleção 
                de monstros a serem tributados.
              </p>
            </div>
            
            <div className="p-4 bg-orange-50 rounded-lg">
              <h3 className="font-semibold text-orange-900 mb-2">Invocações Especiais</h3>
              <p className="text-sm text-orange-700">
                Suporte para invocações especiais de cards do Extra Deck com 
                validação de materiais.
              </p>
            </div>
            
            <div className="p-4 bg-red-50 rounded-lg">
              <h3 className="font-semibold text-red-900 mb-2">Estado do Jogo</h3>
              <p className="text-sm text-red-700">
                Gerenciamento completo do estado do jogo incluindo turnos, fases 
                e limites de invocação.
              </p>
            </div>
            
            <div className="p-4 bg-indigo-50 rounded-lg">
              <h3 className="font-semibold text-indigo-900 mb-2">Interface Intuitiva</h3>
              <p className="text-sm text-indigo-700">
                Modais e controles visuais que guiam o jogador através das 
                ações válidas disponíveis.
              </p>
            </div>
          </div>
        </div>
        
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-2xl font-semibold mb-4">Como Testar</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            <li>Use o controle de fases para navegar entre as fases do jogo</li>
            <li>Clique em um card da mão para selecioná-lo</li>
            <li>Tente invocar monstros de diferentes níveis para ver o sistema de tributos</li>
            <li>Teste a colocação de magias e armadilhas nas zonas apropriadas</li>
            <li>Verifique as mensagens de validação quando tentar ações inválidas</li>
            <li>Observe o estado de invocação sendo atualizado após cada ação</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default DemoPage;