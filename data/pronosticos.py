#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CourtSight Tennis - Procesador de Recomendaciones (Con Guardado Progresivo)
- Reanuda automáticamente donde se dejó
- Guarda tras cada acción (seguro contra caídas)
- Sin delimitadores, salto automático si ya está listo
"""

import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime

# ================================
# UTILIDADES DE CONSOLA
# ================================
def clear_console():
    os.system('cls' if os.name == 'nt' else 'clear')

def safe_get(data, *keys, default="N/A"):
    current = data
    for key in keys:
        if isinstance(current, dict):
            current = current.get(key, default)
        else:
            return default
    return current if current is not None else default

def print_separator(char='=', length=70):
    print(f"\n{char * length}")

# ================================
# 📂 CARGA INTELIGENTE DE ARCHIVOS
# ================================
def scan_json_files():
    search_dirs = [Path.cwd(), Path.cwd()/"data", Path.cwd()/"output", Path.cwd()/"pronosticos", Path(__file__).parent]
    found = set()
    for d in search_dirs:
        if d.exists() and d.is_dir():
            for f in d.glob("*.json"):
                if not f.name.startswith('.') and not f.name.startswith('~'):
                    found.add(f)
    return sorted(list(found), key=lambda p: p.name)

def pick_file_interactive():
    files = scan_json_files()
    if not files:
        print("\n⚠️  No se encontraron archivos JSON en las carpetas comunes.")
        print("💡 Tip: Puedes arrastrar y soltar el archivo directamente aquí.")
        manual = input("📁 O ingresa la ruta completa: ").strip().strip('"').strip("'")
        return Path(manual) if manual else None
        
    print("\n📂 ARCHIVOS JSON ENCONTRADOS:")
    print("-" * 55)
    for i, f in enumerate(files, 1):
        size_kb = f.stat().st_size / 1024
        print(f"  [{i:2d}] {f.name:<35} ({size_kb:.1f} KB)")
    print("-" * 55)
    print("  [0]  Escribir ruta manualmente")
    print("-" * 55)
    
    while True:
        choice = input("👉 Selecciona un número (o 'q' para salir): ").strip()
        if choice.lower() == 'q': return None
        if choice == '0':
            manual = input("📁 Ingresa la ruta: ").strip().strip('"').strip("'")
            return Path(manual) if manual else None
        if choice.isdigit():
            idx = int(choice)
            if 1 <= idx <= len(files): return files[idx-1]
            print("⚠️  Número fuera de rango.")
        else:
            path = Path(choice.strip('"').strip("'"))
            if path.exists() and path.suffix == '.json': return path
            print("⚠️  Opción inválida. Ingresa un número o una ruta válida.")

# ================================
# GUARDADO SEGURO DE PROGRESO
# ================================
def save_progress(matches, output_path):
    """Guarda el estado actual de forma atómica (evita corrupción)."""
    try:
        temp_path = Path(str(output_path) + ".tmp")
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(matches, f, ensure_ascii=False, indent=2)
        # Reemplazo atómico
        temp_path.replace(output_path)
        return True
    except Exception as e:
        print(f"\n⚠️  Error al guardar progreso: {e}")
        return False

# ================================
# LÓGICA DE RECOMENDACIÓN
# ================================
def calc_betting_recommendation(match: dict) -> dict:
    elo = match.get('elo', {})
    market = match.get('market', {})
    p1 = safe_get(match, 'playerA', 'name', 'Jugador A')
    p2 = safe_get(match, 'playerB', 'name', 'Jugador B')
    
    elo_fav = elo.get('favorite', '')
    market_fav = market.get('favorite', '')
    elo_odds = elo.get('odds', 1.0)
    market_odds = market.get('odds', 1.0)
    
    if elo_fav != market_fav:
        ratio = market_odds / elo_odds if elo_odds > 0 else 1.0
        return {"type": "inversion", "label": "INVERSIÓN DE MERCADO", "bet": "moneyline", 
                "pick": market_fav, "line": None, "ratio": f"{ratio:.2f}", "betText": f"victoria de {market_fav}"}
    
    ratio = market_odds / elo_odds if elo_odds > 0 else 1.0
    underdog = p2 if elo_fav == p1 else p1
    
    if ratio >= 1.50:
        return {"type": "discrepancia", "label": "DISCREPANCIA FUERTE", "bet": "handicap", 
                "pick": underdog, "line": "+2.5", "ratio": f"{ratio:.2f}", "betText": f"handicap +2.5 para {underdog}"}
    if ratio >= 1.25:
        return {"type": "discrepancia", "label": "DISCREPANCIA", "bet": "handicap", 
                "pick": underdog, "line": "+3.5", "ratio": f"{ratio:.2f}", "betText": f"handicap +3.5 para {underdog}"}
    if ratio <= 0.85:
        return {"type": "validacion", "label": "VALIDACIÓN DE MERCADO", "bet": "moneyline", 
                "pick": market_fav, "line": None, "ratio": f"{ratio:.2f}", "betText": f"victoria de {market_fav}"}
    
    return {"type": "neutro", "label": "NEUTRO", "bet": "espera", "pick": None, 
            "line": None, "ratio": f"{ratio:.2f}", "betText": "Neutro: Sin factores externos influyendo"}

# ================================
# INTERFAZ INTERACTIVA CON PROGRESO
# ================================
def mostrar_contexto_partido(match, index, total):
    clear_console()
    print(f"📊 PARTIDO {index}/{total}")
    print_separator('-')
    print(f"🏟️  Torneo   : {safe_get(match, 'tournament', 'name', safe_get(match, 'event', 'name'))}")
    print(f"🌍 Superficie: {safe_get(match, 'surface', default='Desconocida')} | 📅 Fecha: {safe_get(match, 'date', default='N/A')} | 🎾 Ronda: {safe_get(match, 'round', default='N/A')}")
    print_separator('-')
    p1 = safe_get(match, 'playerA', 'name')
    p2 = safe_get(match, 'playerB', 'name')
    print(f"👥 ENFRENTAMIENTO:")
    print(f"   {p1} vs {p2}")
    print(f"   📈 ELO    : {p1} ({safe_get(match, 'elo', 'playerA', default='?')}) | {p2} ({safe_get(match, 'elo', 'playerB', default='?')})")
    print(f"   🎯 Favorito ELO: {safe_get(match, 'elo', 'favorite', default='?')} (Cuota: {safe_get(match, 'elo', 'odds', default='?')})")
    print(f"   💰 Favorito Mercado: {safe_get(match, 'market', 'favorite', default='?')} (Cuota: {safe_get(match, 'market', 'odds', default='?')})")
    print(f"   📏 Handicap: {safe_get(match, 'market', 'handicap', safe_get(match, 'line', default='N/A'))}")
    print_separator('=')
    
    rec = match.get('betting_recommendation', {})
    if rec and rec.get('label'):
        print(f"🤖 RECOMENDACIÓN:")
        print(f"   📌 Tipo  : {rec.get('label')}")
        print(f"   💡 Apuesta: {rec.get('betText')}")
        print(f"   📈 Ratio : {rec.get('ratio')}")
    print_separator('=')

def solicitar_analisis():
    print("\n📝 ESPACIO PARA ANÁLISIS:")
    print("   • Escribe o pega tu análisis y presiona Enter.")
    print("   • El frontend HTML se encargará del formato visual.")
    return input("   > ").strip()

def procesar_interactivo(input_path, output_path=None):
    input_file = Path(input_path)
    output_file = Path(output_path) if output_path else input_file.parent / f"{input_file.stem}_analizado{input_file.suffix}"
    
    # 🔄 CARGAR PROGRESO O ARCHIVO NUEVO
    if output_file.exists():
        print(f"📂 Progreso detectado. Cargando desde: {output_file.name}")
        try:
            with open(output_file, 'r', encoding='utf-8') as f:
                matches = json.load(f)
            if isinstance(matches, dict) and 'matches' in matches:
                matches = matches['matches']
        except Exception:
            print("⚠️  Archivo de progreso corrupto. Leyendo desde el original.")
            with open(input_file, 'r', encoding='utf-8') as f:
                matches = json.load(f)
            if isinstance(matches, dict) and 'matches' in matches: matches = matches['matches']
            elif not isinstance(matches, list): matches = [matches]
    elif input_file.exists():
        with open(input_file, 'r', encoding='utf-8') as f:
            matches = json.load(f)
        if isinstance(matches, dict) and 'matches' in matches: matches = matches['matches']
        elif not isinstance(matches, list): matches = [matches]
        save_progress(matches, output_file)
    else:
        print(f"❌ Error: Archivo no encontrado: {input_path}")
        sys.exit(1)
        
    total = len(matches)
    
    # 🔍 BUSCAR DÓNDE CONTINUAR
    start_idx = 0
    for i, m in enumerate(matches):
        has_rec = bool(m.get('betting_recommendation'))
        has_ana = bool(str(m.get('analysis', '')).strip())
        if not (has_rec and has_ana):
            start_idx = i
            break
    else:
        start_idx = total
        
    print(f"\n🚀 CourtSight Analyst Console")
    print(f"📊 Partidos totales: {total}")
    print(f"📍 Reanudando desde: partido {start_idx + 1}")
    input("\n↲ Presiona Enter para comenzar...")
    
    # 🔄 BUCLE DE PROCESAMIENTO
    for i in range(start_idx, total):
        match = matches[i]
        
        # Calcular recomendación solo si falta
        if not match.get('betting_recommendation'):
            match['betting_recommendation'] = calc_betting_recommendation(match)
            
        mostrar_contexto_partido(match, i + 1, total)
        
        print("OPCIONES:")
        print("  [1] ✍️  Escribir análisis")
        print("  [2] ⏭️  Saltar análisis (guarda como vacío)")
        print("  [3] 💾 Guardar progreso y salir")
        print("  [4] 💾 Guardar y continuar")
        
        while True:
            opcion = input("\nElige opción [1/2/3/4]: ").strip()
            if opcion == '1':
                analisis = solicitar_analisis()
                match['analysis'] = analisis
                save_progress(matches, output_file)
                break
            elif opcion == '2':
                match['analysis'] = ""
                print("⏭️  Omitido.")
                save_progress(matches, output_file)
                break
            elif opcion == '3':
                save_progress(matches, output_file)
                print("✅ Progreso guardado. Saliendo...")
                sys.exit(0)
            elif opcion == '4':
                save_progress(matches, output_file)
                print("💾 Guardado. Continuando...")
                break
            else:
                print("⚠️  Opción inválida.")
                
        if i < total - 1:
            print("\n✅ Registrado. Siguiente en 1 segundo...")
            time.sleep(1)
            
    clear_console()
    print_separator('=')
    print(f"✅ PROCESO FINALIZADO")
    print(f"📊 {total} partidos revisados/procesados")
    print(f"💾 Archivo final guardado: {output_file}")
    print_separator('=')

# ================================
# ENTRY POINT
# ================================
def main():
    import argparse
    parser = argparse.ArgumentParser(description='CourtSight Tennis - Analista de Apuestas')
    parser.add_argument('input', nargs='?', help='Ruta al JSON de pronósticos (opcional)')
    parser.add_argument('-o', '--output', help='Ruta de salida (opcional)')
    parser.add_argument('--auto', action='store_true', help='Modo automático (sin interacción)')
    args = parser.parse_args()
    
    if args.auto:
        if not args.input:
            print("❌ En modo --auto debes especificar un archivo de entrada.")
            sys.exit(1)
        # Modo batch simple
        input_file = Path(args.input)
        if not input_file.exists(): sys.exit(f"❌ Archivo no encontrado: {input_file}")
        output_file = Path(args.output) if args.output else input_file.parent / f"{input_file.stem}_processed{input_file.suffix}"
        with open(input_file, 'r', encoding='utf-8') as f: matches = json.load(f)
        if isinstance(matches, dict) and 'matches' in matches: matches = matches['matches']
        elif not isinstance(matches, list): matches = [matches]
        for m in matches:
            if 'betting_recommendation' not in m: m['betting_recommendation'] = calc_betting_recommendation(m)
            if 'analysis' not in m: m['analysis'] = ''
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, 'w', encoding='utf-8') as f: json.dump(matches, f, ensure_ascii=False, indent=2)
        print(f"✅ {len(matches)} partidos procesados en modo automático.\n💾 Guardado en: {output_file}")
    else:
        input_file = Path(args.input) if args.input else pick_file_interactive()
        if input_file and input_file.exists():
            procesar_interactivo(input_file, args.output)
        else:
            print("\n👋 Cancelado por el usuario.")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrumpido. El progreso ya está guardado automáticamente.")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error crítico: {e}")
        sys.exit(1)