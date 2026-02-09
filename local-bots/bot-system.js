/**
 * Interactive Bots System for Duelverse
 * 
 * Features:
 * - Multiple bot profiles with unique personalities
 * - Automatic tournament joining
 * - Chat interactions
 * - Tournament match participation
 * - Realistic human-like behavior
 */

import { createClient } from '@supabase/supabase-js';

// Bot personalities and behaviors
const BOT_CONFIGS = [
  {
    id: 'bot-001',
    username: 'Bot_Duelista',
    email: 'bot1@duelverse.local',
    password: 'botpassword123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bot1',
    personality: 'aggressive',
    level: 5,
    points: 1500,
    winRate: 0.55,
    bio: 'Duelista agressivo que nunca recua!'
  },
  {
    id: 'bot-002',
    username: 'Bot_MagoNegro',
    email: 'bot2@duelverse.local',
    password: 'botpassword123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bot2',
    personality: 'strategic',
    level: 8,
    points: 2500,
    winRate: 0.62,
    bio: 'Mestre das estratégias de magia'
  },
  {
    id: 'bot-003',
    username: 'Bot_DragonMaster',
    email: 'bot3@duelverse.local',
    password: 'botpassword123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bot3',
    personality: 'balanced',
    level: 6,
    points: 1800,
    winRate: 0.58,
    bio: 'Dominador de dragões'
  },
  {
    id: 'bot-004',
    username: 'Bot_SpeedDuel',
    email: 'bot4@duelverse.local',
    password: 'botpassword123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bot4',
    personality: 'fast',
    level: 4,
    points: 1200,
    winRate: 0.52,
    bio: 'Duelos rápidos são minha especialidade'
  },
  {
    id: 'bot-005',
    username: 'Bot_CardMaster',
    email: 'bot5@duelverse.local',
    password: 'botpassword123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bot5',
    personality: 'collector',
    level: 10,
    points: 3500,
    winRate: 0.65,
    bio: 'Colecionador de cartas raras'
  },
  {
    id: 'bot-006',
    username: 'Bot_Shadow',
    email: 'bot6@duelverse.local',
    password: 'botpassword123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bot6',
    personality: 'mysterious',
    level: 7,
    points: 2200,
    winRate: 0.60,
    bio: 'As sombras são minha vantagem'
  },
  {
    id: 'bot-007',
    username: 'Bot_Thunder',
    email: 'bot7@duelverse.local',
    password: 'botpassword123',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bot7',
    personality: 'energetic',
    level: 5,
    points: 1600,
    winRate: 0.54,
    bio: 'Raios e trovões!'
  },
  {
    id: 'bot-008',
    username: 'Bot_Ancient',
    email: 'bot8@duelverse.local',
    password: 'botpassword123',
    avatar: 'https://api.dicebear.com/7.x/monsters-random?seed=bot8',
    personality: 'wise',
    level: 12,
    points: 4200,
    winRate: 0.68,
    bio: 'Antigo guardião dos segredos'
  }
];

// Chat messages by personality
const CHAT_MESSAGES = {
  aggressive: [
    'Vou destruir vocês!',
    'Ninguém me vence!',
    'Preparem-se para perder!',
    'Esse duelo vai ser rápido',
    'Sou imbatível!'
  ],
  strategic: [
    'Hm, vou analisar melhor a situação...',
    'Excelente jogada!',
    'Precisamos pensar com calma',
    'Cada carta tem seu propósito',
    'A paciência é uma virtude no duelo'
  ],
  balanced: [
    'Boa sorte a todos!',
    'Vamos ter um bom duelo',
    'Estou pronto para competir',
    'Que vença o melhor!',
    'Duelos são sobre diversão'
  ],
  fast: [
    'Rápido e certeiro!',
    'Sem demora!',
    'Vamos logo!',
    'Tempo é carta!'
  ],
  collector: [
    'Vocês conhecem a carta misteriosa?',
    'Adoro cartões raros',
    'Minha coleção é impressionante',
    'Yu-Gi-Oh tem mais de 12000 cartas!'
  ],
  mysterious: [
    '...',
    'As sombras me guiam',
    'Você não sabe o que vem',
    'Silêncio... o duelo começa',
    'Mistérios ocultos...'
  ],
  energetic: [
    'Vamos Nessa!',
    'ENERGIA MÁXIMA!',
    'Vou dar meu máximo!',
    'Isso vai ser épico!',
    'SENTINDO A ADRENALINA!'
  ],
  wise: [
    'Já vi muitos duelos em minha vida',
    'A experiência supera a força',
    'Aprenda com cada derrota',
    'O conhecimento é poder',
    'Guardiões antigos conhecem segredos'
  ]
};

// Tournament actions
const TOURNAMENT_ACTIONS = [
  'Inscrito no torneio!',
  'Pronto para lutar!',
  'Que comece o duelo!',
  'Boa sorte a todos os participantes',
  'Ansioso para ver os oponentes'
];

class DuelverseBots {
  constructor(supabaseUrl, supabaseKey) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.bots = [];
    this.isRunning = false;
    this.tournaments = new Map();
    this.chatIntervals = new Map();
  }

  // Initialize all bots
  async initializeBots() {
    console.log('🤖 Inicializando bots...');
    
    for (const config of BOT_CONFIGS) {
      try {
        // Check if bot already exists
        const { data: existing } = await this.supabase
          .from('profiles')
          .select('*')
          .eq('username', config.username)
          .single();

        if (existing) {
          console.log(`✅ Bot ${config.username} já existe`);
          this.bots.push({ ...config, profile: existing });
        } else {
          // Create bot user in auth
          console.log(`🔄 Criando bot ${config.username}...`);
          const { data: authUser, error: authError } = await this.supabase.auth.admin.createUser({
            email: config.email,
            password: config.password,
            email_confirm: true
          });

          if (authError) {
            console.error(`❌ Erro ao criar ${config.username}:`, authError);
            continue;
          }

          // Create profile
          const { data: profile, error: profileError } = await this.supabase
            .from('profiles')
            .insert({
              user_id: authUser.user.id,
              username: config.username,
              avatar_url: config.avatar,
              display_name: config.username,
              bio: config.bio,
              level: config.level,
              points: config.points,
              wins: Math.floor(config.winRate * 50),
              losses: Math.floor((1 - config.winRate) * 50),
              draws: 5,
              win_rate: config.winRate * 100,
              duelcoins_balance: 5000,
              account_type: 'free',
              is_online: true,
              last_seen_at: new Date().toISOString()
            })
            .select()
            .single();

          if (profileError) {
            console.error(`❌ Erro ao criar perfil de ${config.username}:`, profileError);
            continue;
          }

          console.log(`✅ Bot ${config.username} criado com sucesso!`);
          this.bots.push({ ...config, profile });
        }
      } catch (error) {
        console.error(`❌ Erro com bot ${config.username}:`, error);
      }
    }

    console.log(`🤖 Total de bots inicializados: ${this.bots.length}`);
    return this.bots;
  }

  // Authenticate all bots
  async authenticateBots() {
    console.log('🔐 Autenticando bots...');
    
    for (const bot of this.bots) {
      try {
        const { data, error } = await this.supabase.auth.signInWithPassword({
          email: bot.email,
          password: bot.password
        });

        if (error) {
          console.error(`❌ Erro de autenticação para ${bot.username}:`, error);
          continue;
        }

        bot.session = data.session;
        bot.authenticated = true;
        console.log(`✅ ${bot.username} autenticado`);
      } catch (error) {
        console.error(`❌ Falha na autenticação de ${bot.username}:`, error);
      }
    }
  }

  // Set all bots online
  async setBotsOnline() {
    console.log('🟢 Colocando bots online...');
    
    for (const bot of this.bots) {
      if (bot.profile?.user_id) {
        await this.supabase
          .from('profiles')
          .update({ is_online: true, last_seen_at: new Date().toISOString() })
          .eq('user_id', bot.profile.user_id);
      }
    }
    
    console.log('✅ Todos os bots estão online');
  }

  // Start chat activity for a bot
  startChatActivity(bot) {
    if (this.chatIntervals.has(bot.id)) {
      return;
    }

    const messages = CHAT_MESSAGES[bot.personality] || CHAT_MESSAGES.balanced;
    
    const interval = setInterval(async () => {
      if (!bot.authenticated) return;

      try {
        // Random message from personality
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        
        // Post to global chat
        await this.supabase.from('global_chat').insert({
          user_id: bot.profile?.user_id,
          content: randomMessage
        });
        
        console.log(`💬 ${bot.username}: ${randomMessage}`);
      } catch (error) {
        // Ignore errors
      }
    }, 30000 + Math.random() * 60000); // Random interval between 30-90 seconds

    this.chatIntervals.set(bot.id, interval);
    console.log(`💬 Atividade de chat iniciada para ${bot.username}`);
  }

  // Stop chat activity for a bot
  stopChatActivity(bot) {
    const interval = this.chatIntervals.get(bot.id);
    if (interval) {
      clearInterval(interval);
      this.chatIntervals.delete(bot.id);
      console.log(`🔇 Atividade de chat parada para ${bot.username}`);
    }
  }

  // Start all chat activities
  startAllChatActivities() {
    console.log('💬 Iniciando atividades de chat...');
    
    for (const bot of this.bots) {
      // Start after random delay
      setTimeout(() => {
        this.startChatActivity(bot);
      }, Math.random() * 30000);
    }
  }

  // Stop all chat activities
  stopAllChatActivities() {
    console.log('🔇 Parando todas as atividades de chat...');
    
    for (const bot of this.bots) {
      this.stopChatActivity(bot);
    }
  }

  // Find available tournaments
  async findOpenTournaments() {
    const { data } = await this.supabase
      .from('tournaments')
      .select('*')
      .eq('status', 'upcoming')
      .order('created_at', { ascending: false })
      .limit(5);

    return data || [];
  }

  // Bot joins tournament
  async joinTournament(bot, tournamentId) {
    if (!bot.authenticated || !bot.profile?.user_id) {
      console.log(`❌ ${bot.username} não pode entrar no torneio - não autenticado`);
      return false;
    }

    try {
      // Check if already registered
      const { data: existing } = await this.supabase
        .from('tournament_participants')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('user_id', bot.profile.user_id)
        .single();

      if (existing) {
        console.log(`${bot.username} já está inscrito no torneio`);
        return true;
      }

      // Join tournament
      const { error } = await this.supabase
        .from('tournament_participants')
        .insert({
          tournament_id: tournamentId,
          user_id: bot.profile.user_id,
          status: 'registered',
          joined_at: new Date().toISOString()
        });

      if (error) {
        console.log(`❌ ${bot.username} não pôde entrar no torneio:`, error.message);
        return false;
      }

      console.log(`✅ ${bot.username} se inscreveu no torneio!`);
      
      // Post to chat
      await this.supabase.from('global_chat').insert({
        user_id: bot.profile.user_id,
        content: `Me inscrevi no torneio! Boa sorte a todos! 🎴`
      });

      return true;
    } catch (error) {
      console.log(`❌ Erro ao juntar ${bot.username} ao torneio:`, error);
      return false;
    }
  }

  // Find tournament participants
  async getTournamentParticipants(tournamentId) {
    const { data } = await this.supabase
      .from('tournament_participants')
      .select('*, profiles:user_id(*)')
      .eq('tournament_id', tournamentId);

    return data || [];
  }

  // Simulate tournament match result
  simulateMatchResult(player1Id, player2Id) {
    const random = Math.random();
    let winnerId;
    
    if (random < 0.5) {
      winnerId = player1Id;
    } else if (random < 0.5 + 0.1) {
      winnerId = null; // Draw
    } else {
      winnerId = player2Id;
    }

    return { winner_id: winnerId, is_draw: winnerId === null };
  }

  // Create and manage tournament
  async createTournamentWithBots(tournamentConfig) {
    console.log('🏆 Criando torneio com bots...');

    // Create tournament
    const { data: tournament, error: tourneyError } = await this.supabase
      .from('tournaments')
      .insert({
        name: tournamentConfig.name || 'Torneio dos Bots',
        description: 'Torneio automático com bots interativos',
        created_by: this.bots[0]?.profile?.user_id || tournamentConfig.adminId,
        status: 'upcoming',
        start_date: new Date().toISOString(),
        max_participants: tournamentConfig.maxParticipants || 16,
        min_participants: tournamentConfig.minParticipants || 4,
        entry_fee: 0,
        prize_pool: tournamentConfig.prizePool || 0,
        rules: 'Regras padrão de Yu-Gi-Oh TCG',
        current_round: 0,
        total_rounds: 3
      })
      .select()
      .single();

    if (tourneyError) {
      console.error('❌ Erro ao criar torneio:', tourneyError);
      return null;
    }

    console.log(`✅ Torneio criado: ${tournament.name} (ID: ${tournament.id})`);
    this.tournaments.set(tournament.id, tournament);

    // Bots join tournament
    console.log('🤖 Bots entrando no torneio...');
    
    // Shuffle bots and select participants
    const shuffledBots = [...this.bots].sort(() => Math.random() - 0.5);
    const botCount = Math.min(shuffledBots.length, tournament.max_participants - 1);
    
    for (let i = 0; i < botCount; i++) {
      await this.joinTournament(shuffledBots[i], tournament.id);
      await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    }

    return tournament;
  }

  // Start tournament
  async startTournament(tournamentId) {
    console.log(`🏆 Iniciando torneio ${tournamentId}...`);

    const { data: participants } = await this.supabase
      .from('tournament_participants')
      .select('*')
      .eq('tournament_id', tournamentId);

    if (!participants || participants.length < 2) {
      console.log('❌ Não há participantes suficientes');
      return false;
    }

    // Update tournament status
    await this.supabase
      .from('tournaments')
      .update({ status: 'active', started_at: new Date().toISOString() })
      .eq('id', tournamentId);

    // Create first round matches
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    const matches = [];

    for (let i = 0; i < shuffled.length - 1; i += 2) {
      matches.push({
        tournament_id: tournamentId,
        round: 1,
        player1_id: shuffled[i].user_id,
        player2_id: shuffled[i + 1].user_id,
        status: 'pending'
      });
    }

    // Handle odd number of participants (bye)
    if (shuffled.length % 2 === 1) {
      const lastPlayer = shuffled[shuffled.length - 1];
      matches.push({
        tournament_id: tournamentId,
        round: 1,
        player1_id: lastPlayer.user_id,
        player2_id: null,
        status: 'completed',
        winner_id: lastPlayer.user_id
      });
    }

    await this.supabase.from('tournament_matches').insert(matches);
    console.log(`✅ Partidas da rodada 1 criadas: ${matches.length}`);

    return true;
  }

  // Simulate all matches for a round
  async simulateRound(tournamentId, round) {
    console.log(`🎮 Simulando rodada ${round}...`);

    const { data: matches } = await this.supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('round', round)
      .eq('status', 'pending');

    if (!matches || matches.length === 0) {
      console.log('❌ Nenhuma partida pendente encontrada');
      return false;
    }

    for (const match of matches) {
      if (!match.player1_id || !match.player2_id) continue;

      const { winner_id, is_draw } = this.simulateMatchResult(match.player1_id, match.player2_id);

      await this.supabase
        .from('tournament_matches')
        .update({
          winner_id,
          status: 'completed',
          completed_at: new Date().toISOString()
        })
        .eq('id', match.id);

      // Update participant stats
      if (winner_id) {
        await this.supabase.rpc('update_tournament_stats', {
          p_user_id: winner_id,
          p_tournament_id: tournamentId,
          p_is_win: true
        });
      }

      const loser_id = winner_id === match.player1_id ? match.player2_id : match.player1_id;
      if (loser_id) {
        await this.supabase.rpc('update_tournament_stats', {
          p_user_id: loser_id,
          p_tournament_id: tournamentId,
          p_is_win: false
        });
      }

      console.log(`⚔️ Partida concluída: Vencedor = ${winner_id || 'Empate'}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return true;
  }

  // Run complete tournament simulation
  async runTournament(tournamentConfig) {
    console.log('='.repeat(50));
    console.log('🏆 INICIANDO SIMULAÇÃO DE TORNEO COMPLETO');
    console.log('='.repeat(50));

    // Create tournament
    const tournament = await this.createTournamentWithBots(tournamentConfig);
    if (!tournament) {
      console.log('❌ Falha ao criar torneio');
      return null;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start tournament
    await this.startTournament(tournament.id);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Simulate each round
    for (let round = 1; round <= tournament.total_rounds; round++) {
      console.log(`\n🎴 Rodada ${round}/${tournament.total_rounds}`);
      await this.simulateRound(tournament.id, round);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Complete tournament
    await this.supabase
      .from('tournaments')
      .update({ status: 'completed', end_date: new Date().toISOString() })
      .eq('id', tournament.id);

    console.log('='.repeat(50));
    console.log('✅ TORNEO COMPLETADO COM SUCESSO!');
    console.log('='.repeat(50));

    return tournament;
  }

  // Start all bot activities
  async startAllActivities(tournamentConfig) {
    console.log('🚀 Iniciando todas as atividades dos bots...');

    // Set bots online
    await this.setBotsOnline();

    // Start chat activities
    this.startAllChatActivities();

    // Run tournament if config provided
    if (tournamentConfig) {
      await this.runTournament(tournamentConfig);
    }
  }

  // Stop everything
  async stopAllActivities() {
    console.log('🛑 Parando todas as atividades...');

    // Stop chat activities
    this.stopAllChatActivities();

    // Set bots offline
    await this.setBotsOnline(false);

    console.log('✅ Todas as atividades paradas');
  }

  // Get bot status
  getStatus() {
    return {
      totalBots: this.bots.length,
      authenticatedBots: this.bots.filter(b => b.authenticated).length,
      running: this.isRunning,
      tournaments: this.tournaments.size,
      activeChatIntervals: this.chatIntervals.size
    };
  }
}

export { DuelverseBots, BOT_CONFIGS };
