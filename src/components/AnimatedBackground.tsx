import React from 'react';
import './AnimatedBackground.css';

export function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden bg-background">
      {/* Dynamic Overlay Gradient to enhance the minimalist aesthetic */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/10 via-background to-background opacity-60"></div>
      
      {/* Floating Elements (inspired by the Futuristic-CSS animation refs) */}
      <div className="floating-elements w-full h-full absolute inset-0">
        <div className="particle w-8 h-8 rounded-md border-2 border-primary/40 absolute shadow-[0_0_15px_hsl(var(--primary)/0.3)]" style={{ top: '60%', left: '10%' }}></div>
        <div className="particle w-12 h-12 rounded-full border-2 border-primary/30 absolute shadow-[0_0_15px_hsl(var(--primary)/0.2)]" style={{ top: '20%', left: '80%' }}></div>
        <div className="particle w-4 h-4 rounded-full bg-primary/40 absolute shadow-[0_0_15px_hsl(var(--primary)/0.5)]" style={{ top: '80%', left: '30%' }}></div>
        <div className="particle w-16 h-16 rounded-lg border-2 border-primary/35 absolute shadow-[0_0_20px_hsl(var(--primary)/0.2)]" style={{ top: '10%', left: '20%' }}></div>
        <div className="particle w-6 h-6 rotate-45 border-2 border-primary/50 absolute shadow-[0_0_10px_hsl(var(--primary)/0.4)]" style={{ top: '40%', left: '70%' }}></div>
        <div className="particle w-10 h-10 rounded-full border border-primary/40 absolute shadow-[0_0_10px_hsl(var(--primary)/0.2)]" style={{ top: '80%', left: '90%' }}></div>
        <div className="particle w-3 h-3 bg-primary/60 absolute shadow-[0_0_10px_hsl(var(--primary)/0.6)]" style={{ top: '50%', left: '50%' }}></div>
        
        {/* Mais animações! */}
        <div className="particle w-14 h-14 rounded-full border border-accent/40 absolute shadow-[0_0_10px_hsl(var(--accent)/0.3)]" style={{ top: '30%', left: '40%' }}></div>
        <div className="particle w-5 h-5 bg-accent/40 rotate-12 absolute shadow-[0_0_10px_hsl(var(--accent)/0.5)]" style={{ top: '70%', left: '15%' }}></div>
        <div className="particle w-20 h-20 rounded-xl border border-primary/25 absolute shadow-[0_0_20px_hsl(var(--primary)/0.1)]" style={{ top: '85%', left: '60%' }}></div>
        <div className="particle w-7 h-7 bg-primary/40 rounded-full absolute shadow-[0_0_10px_hsl(var(--primary)/0.4)]" style={{ top: '15%', left: '5%' }}></div>
        <div className="particle w-2 h-2 bg-white/60 absolute shadow-[0_0_5px_rgba(255,255,255,0.8)]" style={{ top: '35%', left: '85%' }}></div>
      </div>
      
      {/* Dual tone subtle grid (inspired by hacker/futuristic interfaces) */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_40%,#000_70%,transparent_100%)]"></div>
    </div>
  );
}
