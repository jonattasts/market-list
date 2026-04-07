/* ==========================================================================
   SYNC OVERLAY — ANIMAÇÕES DE CARREGAMENTO E TRANSIÇÃO DE TELAS
   ========================================================================== */

/* --- LÓGICA DE CONFIGURAÇÃO COM UI DE ANIMAÇÃO --- */

/**
 * Exibe o overlay de sincronização com animação de progresso simulado.
 * Utilizado durante o primeiro acesso de novos usuários para
 * indicar visualmente que o ambiente está sendo preparado.
 *
 * @returns {Promise<boolean>} Sempre resolve true ao concluir a animação
 */
async function runSetupAnimation() {
  const overlay = document.getElementById("sync-overlay");
  const progressBar = document.getElementById("sync-progress-bar");
  const syncText = document.querySelector(".sync-text");
  const syncSubtext = document.querySelector(".sync-subtext");

  // Ativa a Overlay Visual
  if (overlay) {
    overlay.style.display = "flex";
    await new Promise((r) => setTimeout(r, 50));
    overlay.classList.add("active");
  }

  if (syncText) syncText.innerText = "Preparando seu ambiente...";
  if (syncSubtext)
    syncSubtext.innerText =
      "Preparando sua nuvem e organizando as prateleiras.";

  for (let i = 1; i <= 3; i++) {
    await new Promise((r) => setTimeout(r, 700));
    if (progressBar) {
      progressBar.style.width = `${(i / 3) * 100}%`;
    }
  }

  await new Promise((r) => setTimeout(r, 800));
  if (overlay) {
    overlay.classList.remove("active");
    setTimeout(() => (overlay.style.display = "none"), 500);
  }
  return true;
}

/**
 * Exibe o overlay de transição do logout para cobrir a tela
 * durante o intervalo entre o signOut e a exibição do onboarding,
 * eliminando o flash branco/cinza que ocorria nesse período.
 *
 * O overlay usa opacity para uma transição suave de entrada,
 * e é removido apenas após o onboarding estar visível e inicializado.
 */
function showLogoutTransitionOverlay() {
  const logoutOverlayElement = document.getElementById(
    "logout-transition-overlay",
  );
  if (!logoutOverlayElement) return;

  // Garante que o overlay esteja renderizado antes de animar a opacidade
  logoutOverlayElement.style.display = "block";
  requestAnimationFrame(() => {
    logoutOverlayElement.classList.add("visible");
  });
}

/**
 * Remove o overlay de transição do logout com um fade-out suave.
 * Chamado apenas após o onboarding estar visível e o carrossel inicializado,
 * garantindo que a tela de destino já esteja pronta antes do overlay sair.
 *
 * O delay de 350ms antes de ocultar o display corresponde à duração
 * da transição de opacidade definida no CSS (.logout-transition-overlay).
 */
function hideLogoutTransitionOverlay() {
  const logoutOverlayElement = document.getElementById(
    "logout-transition-overlay",
  );
  if (!logoutOverlayElement) return;

  logoutOverlayElement.classList.remove("visible");

  // Aguarda o fade-out antes de remover do fluxo visual
  setTimeout(() => {
    logoutOverlayElement.style.display = "none";
  }, 350);
}

export { runSetupAnimation, showLogoutTransitionOverlay, hideLogoutTransitionOverlay };
