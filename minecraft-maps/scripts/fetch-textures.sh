#!/usr/bin/env bash
# Downloads Minecraft textures (Mojang's property — personal/local use only, not committed to git).
# Source: InventivetalentDev/minecraft-assets (extracted vanilla client assets), tag 1.21.4.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE="https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.4/assets/minecraft/textures"
OUT="assets/mc"
mkdir -p "$OUT"
# "path/in/repo:local-name"
FILES=(
  block/dirt.png:dirt.png
  block/stone.png:stone.png
  block/grass_block_side.png:grass_side.png
  block/grass_block_top.png:grass_top.png
  block/gold_block.png:gold_block.png
  block/oak_planks.png:planks.png
  item/compass_00.png:compass.png
  item/minecart.png:minecart.png
  item/leather_boots.png:boots.png
  item/saddle.png:saddle.png
  item/emerald.png:emerald.png
  item/map.png:map.png
  gui/sprites/widget/button.png:button.png
  gui/sprites/widget/button_highlighted.png:button_hl.png
  gui/sprites/widget/button_disabled.png:button_off.png
  gui/sprites/widget/text_field.png:field.png
  entity/player/wide/steve.png:steve.png
)
for f in "${FILES[@]}"; do
  src="${f%%:*}"; dst="${f##*:}"
  curl -fsS --retry 3 -o "$OUT/$dst" "$BASE/$src" && echo "ok  $dst" || echo "FAIL $src"
done
