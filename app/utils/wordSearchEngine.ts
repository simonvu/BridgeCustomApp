/**
 * Pure TypeScript Word Search Puzzle Generator Engine
 * Generates N x M letter grid with placed words in 8 directions,
 * pseudo-random seeding for reproducible layouts, and highlight coordinate data.
 */

export type OverlapDensity = "BALANCED" | "MINIMAL" | "HIGH";

export interface WordSearchOptions {
  words: string[];
  gridWidth?: number;
  gridHeight?: number;
  allowReverse?: boolean;
  allowDiagonal?: boolean;
  seed?: number;
  overlapDensity?: OverlapDensity;
  placementStrategy?: "DISTRIBUTED" | "MAX_OVERLAP";
}

export interface PlacedWord {
  word: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  direction: Direction;
  angleDeg: number;
}

export interface WordSearchResult {
  grid: string[][];
  placedWords: PlacedWord[];
  unplacedWords: string[];
  gridWidth: number;
  gridHeight: number;
}

export type Direction =
  | "H_FORWARD"
  | "H_BACKWARD"
  | "V_FORWARD"
  | "V_BACKWARD"
  | "D_DOWN_RIGHT"
  | "D_DOWN_LEFT"
  | "D_UP_RIGHT"
  | "D_UP_LEFT";

interface DirectionVector {
  dir: Direction;
  dx: number;
  dy: number;
  angleDeg: number;
}

const DIRECTION_VECTORS: DirectionVector[] = [
  { dir: "H_FORWARD", dx: 1, dy: 0, angleDeg: 0 },
  { dir: "H_BACKWARD", dx: -1, dy: 0, angleDeg: 180 },
  { dir: "V_FORWARD", dx: 0, dy: 1, angleDeg: 90 },
  { dir: "V_BACKWARD", dx: 0, dy: -1, angleDeg: 270 },
  { dir: "D_DOWN_RIGHT", dx: 1, dy: 1, angleDeg: 45 },
  { dir: "D_DOWN_LEFT", dx: -1, dy: 1, angleDeg: 135 },
  { dir: "D_UP_RIGHT", dx: 1, dy: -1, angleDeg: -45 },
  { dir: "D_UP_LEFT", dx: -1, dy: -1, angleDeg: -135 },
];

/**
 * Seeded Pseudo-Random Number Generator (PRNG) - Mulberry32
 */
function createPRNG(seed: number) {
  let s = seed >>> 0;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Main Word Search Puzzle Generator Function
 */
export function generateWordSearchPuzzle(options: WordSearchOptions): WordSearchResult {
  const {
    words = [],
    gridWidth = 10,
    gridHeight = 10,
    allowReverse = false, // Default FALSE: Only place words in forward directions
    allowDiagonal = true,
    seed = 12345,
    overlapDensity = "BALANCED",
  } = options;

  const random = createPRNG(seed);

  const width = Math.max(5, Math.min(30, gridWidth));
  const height = Math.max(5, Math.min(30, gridHeight));

  // Initialize empty grid (null values)
  const grid: (string | null)[][] = Array.from({ length: height }, () =>
    Array(width).fill(null)
  );

  // Filter allowed direction vectors (Forward directions MUST have dx >= 0 and dy >= 0)
  const availableDirections = DIRECTION_VECTORS.filter((v) => {
    const isReverseDirection = v.dx < 0 || v.dy < 0;
    if (!allowReverse && isReverseDirection) {
      return false;
    }
    if (!allowDiagonal && v.dir.startsWith("D_")) {
      return false;
    }
    return true;
  });

  if (availableDirections.length === 0) {
    availableDirections.push(DIRECTION_VECTORS[0]); // Default H_FORWARD
  }

  // Sanitize and sort words descending by length for optimal placement
  const sanitizedWords = words
    .map((w) => w.trim().toUpperCase().replace(/[^A-Z]/g, ""))
    .filter((w) => w.length > 0 && w.length <= Math.max(width, height));

  const sortedWords = Array.from(new Set(sanitizedWords)).sort((a, b) => b.length - a.length);

  const placedWords: PlacedWord[] = [];
  const unplacedWords: string[] = [];

  let totalPuzzleOverlaps = 0;

  for (const word of sortedWords) {
    const len = word.length;
    interface CandidatePlacement {
      vec: DirectionVector;
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      overlapCount: number;
      score: number;
    }
    const candidates: CandidatePlacement[] = [];

    for (const vec of availableDirections) {
      const minX = vec.dx < 0 ? len - 1 : 0;
      const maxX = vec.dx > 0 ? width - len : width - 1;
      const minY = vec.dy < 0 ? len - 1 : 0;
      const maxY = vec.dy > 0 ? height - len : height - 1;

      if (minX > maxX || minY > maxY) continue;

      for (let sx = minX; sx <= maxX; sx++) {
        for (let sy = minY; sy <= maxY; sy++) {
          let canPlace = true;
          let overlaps = 0;

          for (let i = 0; i < len; i++) {
            const cx = sx + i * vec.dx;
            const cy = sy + i * vec.dy;
            const existing = grid[cy][cx];
            if (existing !== null && existing !== word[i]) {
              canPlace = false;
              break;
            }
            if (existing === word[i]) {
              overlaps++;
            }
          }

          if (canPlace) {
            const ex = sx + (len - 1) * vec.dx;
            const ey = sy + (len - 1) * vec.dy;
            const midX = (sx + ex) / 2;
            const midY = (sy + ey) / 2;

            let minDistanceToOthers = 999;
            placedWords.forEach((pw) => {
              const pwMidX = (pw.startX + pw.endX) / 2;
              const pwMidY = (pw.startY + pw.endY) / 2;
              const dist = Math.hypot(midX - pwMidX, midY - pwMidY);
              if (dist < minDistanceToOthers) minDistanceToOthers = dist;
            });

            let score = 0;

            if (overlapDensity === "MINIMAL") {
              // MINIMAL: Spread words as far apart as possible, 0 or max 1 overlap
              const overlapPenalty = overlaps * -40;
              const distanceBonus = minDistanceToOthers === 999 ? 20 : minDistanceToOthers * 15;
              score = distanceBonus + overlapPenalty;
            } else if (overlapDensity === "HIGH") {
              // HIGH: Maximize overlaps
              score = overlaps * 60 + minDistanceToOthers * 2;
            } else {
              // BALANCED (DEFAULT): Target 1-2 tasteful intersections, keeping rest spaced nicely
              let overlapScore = 0;
              if (overlaps === 1 && totalPuzzleOverlaps < 2) {
                overlapScore = 40; // Sweet spot: 1-2 clean intersections in puzzle
              } else if (overlaps > 1) {
                overlapScore = -25 * (overlaps - 1); // Penalize 3+ overlaps stacking
              } else {
                overlapScore = 10;
              }

              const distanceBonus = minDistanceToOthers === 999 ? 15 : Math.min(minDistanceToOthers, 8) * 8;
              score = overlapScore + distanceBonus;
            }

            candidates.push({
              vec,
              startX: sx,
              startY: sy,
              endX: ex,
              endY: ey,
              overlapCount: overlaps,
              score,
            });
          }
        }
      }
    }

    if (candidates.length > 0) {
      // Sort candidates by highest score
      candidates.sort((a, b) => b.score - a.score);

      // Pick randomly among top 3 candidates to introduce seed variation
      const topCount = Math.min(3, candidates.length);
      const chosenIndex = Math.floor(random() * topCount);
      const chosen = candidates[chosenIndex];

      for (let i = 0; i < len; i++) {
        const cx = chosen.startX + i * chosen.vec.dx;
        const cy = chosen.startY + i * chosen.vec.dy;
        grid[cy][cx] = word[i];
      }

      if (chosen.overlapCount > 0) {
        totalPuzzleOverlaps += chosen.overlapCount;
      }

      placedWords.push({
        word,
        startX: chosen.startX,
        startY: chosen.startY,
        endX: chosen.endX,
        endY: chosen.endY,
        direction: chosen.vec.dir,
        angleDeg: chosen.vec.angleDeg,
      });
    } else {
      unplacedWords.push(word);
    }
  }

  // Fill remaining empty null cells with random A-Z letters
  const finalGrid: string[][] = grid.map((row) =>
    row.map((cell) => cell || ALPHABET[Math.floor(random() * ALPHABET.length)])
  );

  return {
    grid: finalGrid,
    placedWords,
    unplacedWords,
    gridWidth: width,
    gridHeight: height,
  };
}
