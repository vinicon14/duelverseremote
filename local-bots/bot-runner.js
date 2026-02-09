/**
 * Bot Runner - Execute para iniciar os bots
 * 
 * Usage: node bot-runner.js
 */

const { DuelverseBots, BOT_CONFIGS } = require('./bot-system.js');

// Supabase configuration - UPDATE THESE VALUES
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_KEY = 'YOUR_ANON_KEY';

async function main() {
  console.log('='.repeat(60));
  console.log('🤖 DUELVERSE BOTS SYSTEM');
  console.log('='.repeat(60));
  console.log();

  const bots = new DuelverseBots(SUPABASE_URL, SUPABASE_KEY);

  try {
    // Initialize bots
    console.log('1. Inicializando bots...');
    await bots.initializeBots();
    console.log();

    // Authenticate bots
    console.log('2. Autenticando bots...');
    await bots.authenticateBots();
    console.log();

    // Set bots online
    console.log('3. Colocando bots online...');
    await bots.setBotsOnline();
    console.log();

    // Start chat activities
    console.log('4. Iniciando atividades de chat...');
    bots.startAllChatActivities();
    console.log();

    // Tournament configuration
    const tournamentConfig = {
      name: 'Torneio dos Bots Alpha',
      maxParticipants: 16,
      minParticipants: 4,
      prizePool: 0,
      adminId: bots.bots[0]?.profile?.user_id
    };

    console.log('5. Criando e executando torneio...');
    console.log('   (Os bots vão se inscrever automaticamente)');
    console.log();

    await bots.runTournament(tournamentConfig);
    console.log();

    // Keep running
    console.log('='.repeat(60));
    console.log('✅ SISTEMA DE BOTS ATIVO!');
    console.log('='.repeat(60));
    console.log();
    console.log('Os bots estão:');
    console.log('  • Online na plataforma');
    console.log('  • Interagindo no chat global');
    console.log('  • Participando do torneio');
    console.log();
    console.log('Pressione Ctrl+C para parar os bots');
    console.log();

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\n🛑 Parando bots...');
      await bots.stopAllActivities();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Erro:', error);
    process.exit(1);
  }
}

main();
