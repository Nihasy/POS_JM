/**
 * Impression d'un document HTML via un iframe caché.
 *
 * window.open est bloqué/instable dans le WebView Tauri : on injecte
 * le document dans un iframe de la page courante, on attend le
 * chargement des images (QR en data-URL), puis on imprime.
 */
export async function printHtml(html: string): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    throw new Error("Impossible de préparer la page d'impression.");
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Attendre le décodage des images (QR) avant d'imprimer
  const images = Array.from(doc.images);
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          })
    )
  );
  await new Promise((resolve) => setTimeout(resolve, 100));

  win.focus();
  win.print();
  setTimeout(() => iframe.remove(), 2000);
}
