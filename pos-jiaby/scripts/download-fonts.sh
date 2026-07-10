#!/bin/bash
# Téléchargement des polices JIABY POS
# Usage: bash scripts/download-fonts.sh

set -e

FONTS_DIR="public/fonts"
mkdir -p "$FONTS_DIR"

echo "=== Téléchargement des polices JIABY POS ==="

# Archivo (variable, OFL)
echo "[1/4] Téléchargement Archivo..."
curl -L --create-dirs -o "$FONTS_DIR/Archivo-VariableFont_wdth,wght.ttf" \
  "https://github.com/google/fonts/raw/main/ofl/archivo/Archivo%5Bwdth%2Cwght%5D.ttf" \
  2>/dev/null || {
  echo "  → Fallback: téléchargement depuis Google Fonts..."
  curl -L -o /tmp/archivo.zip \
    "https://fonts.google.com/download?family=Archivo" 2>/dev/null || true
  if [ -f /tmp/archivo.zip ]; then
    unzip -o /tmp/archivo.zip -d /tmp/archivo/ 2>/dev/null || true
    find /tmp/archivo -name "*Variable*" -exec cp {} "$FONTS_DIR/Archivo-VariableFont_wdth,wght.ttf" \; 2>/dev/null || true
  fi
}

echo "[2/4] Téléchargement Archivo Italic..."
curl -L --create-dirs -o "$FONTS_DIR/Archivo-Italic-VariableFont_wdth,wght.ttf" \
  "https://github.com/google/fonts/raw/main/ofl/archivo/Archivo-Italic%5Bwdth%2Cwght%5D.ttf" \
  2>/dev/null || echo "  → Non trouvé, sera ignoré"

# IBM Plex Mono (OFL)
echo "[3/4] Téléchargement IBM Plex Mono Regular..."
curl -L --create-dirs -o "$FONTS_DIR/IBMPlexMono-Regular.ttf" \
  "https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Regular.ttf" \
  2>/dev/null || echo "  → Non trouvé, sera ignoré"

echo "[4/4] Téléchargement IBM Plex Mono Bold..."
curl -L --create-dirs -o "$FONTS_DIR/IBMPlexMono-Bold.ttf" \
  "https://github.com/google/fonts/raw/main/ofl/ibmplexmono/IBMPlexMono-Bold.ttf" \
  2>/dev/null || echo "  → Non trouvé, sera ignoré"

echo ""
echo "=== Vérification ==="
for f in "$FONTS_DIR"/*.ttf; do
  if [ -f "$f" ]; then
    SIZE=$(du -h "$f" | cut -f1)
    echo "  ✓ $(basename "$f") ($SIZE)"
  else
    echo "  ✗ Manquant: $(basename "$f")"
  fi
done

echo ""
echo "Polices téléchargées dans $FONTS_DIR/"
echo "Si des polices sont manquantes, téléchargez-les manuellement:"
echo "  Archivo:   https://fonts.google.com/specimen/Archivo"
echo "  IBM Plex:  https://fonts.google.com/specimen/IBM+Plex+Mono"
