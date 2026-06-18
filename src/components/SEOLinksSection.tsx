/**
 * SEO Links Section
 * Provides crawlable internal links between all SEO landing pages.
 * Uses real <a> tags so search engine crawlers can discover every URL
 * even before JavaScript hydrates.
 */
const SEO_LINKS = [
  { href: "/", label: "Duelverse — Início" },
  { href: "/duelverse-yugioh-duelos-online", label: "Yu-Gi-Oh Online no Duelverse" },
  { href: "/como-jogar-yugioh-online", label: "Como Jogar Yu-Gi-Oh Online" },
  { href: "/deck-builder-yugioh", label: "Deck Builder Yu-Gi-Oh" },
  { href: "/torneios-yugioh-online", label: "Torneios Yu-Gi-Oh Online" },
  { href: "/yugioh-remote-duel", label: "Yu-Gi-Oh Remote Duel" },
  { href: "/duels", label: "Duelos ao Vivo" },
  { href: "/matchmaking", label: "Matchmaking" },
  { href: "/tournaments", label: "Torneios" },
  { href: "/ranking", label: "Ranking Global" },
  { href: "/deck-builder", label: "Construtor de Decks" },
  { href: "/news", label: "Notícias Yu-Gi-Oh" },
];

export const SEOLinksSection = () => {
  return (
    <section className="py-12 px-4 relative z-10 border-t border-border/40">
      <div className="container mx-auto max-w-4xl">
        <h2 className="text-xl font-bold mb-4 text-foreground">Navegue pelo Duelverse</h2>
        <nav aria-label="Páginas principais">
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {SEO_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </section>
  );
};

export default SEOLinksSection;
