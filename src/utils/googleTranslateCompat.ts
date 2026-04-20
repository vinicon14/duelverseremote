/**
 * Google Translate compatibility patch for React.
 *
 * O Google Translate (Chrome mobile, extensão Translate, etc.) substitui os
 * nós de texto originais do DOM por <font> wrappers contendo a tradução. O
 * React mantém referências aos nós originais e, ao re-renderizar (ex: trocar
 * idioma, atualizar estado), chama parent.removeChild(originalTextNode) — mas
 * o pai já não é mais o esperado, lançando NotFoundError e quebrando a árvore
 * inteira ("white screen").
 *
 * Solução amplamente usada (Facebook, Wix, Discord): monkey-patch defensivo
 * em Node.prototype.removeChild e Node.prototype.insertBefore para ignorar
 * silenciosamente quando o nó já foi movido pelo Translate.
 *
 * Referência: https://github.com/facebook/react/issues/11538
 */
export const installGoogleTranslateCompat = () => {
  if (typeof Node === "undefined") return;
  const proto = Node.prototype as any;

  if (proto.__gtCompatInstalled) return;
  proto.__gtCompatInstalled = true;

  const originalRemoveChild = proto.removeChild;
  proto.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      if (child.parentNode) {
        // O Google Translate moveu o nó para outro pai (<font>). Remova-o de
        // onde ele realmente está, mantendo a intenção de "tirar do DOM".
        try {
          return originalRemoveChild.call(child.parentNode, child) as T;
        } catch {
          /* fall through */
        }
      }
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn(
          "[GoogleTranslateCompat] Ignored removeChild on detached node",
        );
      }
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = proto.insertBefore;
  proto.insertBefore = function <T extends Node>(
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.warn(
          "[GoogleTranslateCompat] Appended node — reference detached by translator",
        );
      }
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
};
