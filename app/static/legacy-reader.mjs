// University of Liverpool / Speedwell A4 MCQ sheet reader. Coordinates below
// are measured on the original form at 703 × 994 pixels. The pink frame (or
// its grayscale equivalent) is located before answer positions are sampled.
const REFERENCE = { left: 37, right: 665, top: 285.5, bottom: 954.5 };
const ANSWER_X = [75, 242, 408, 583];
const CHOICES = "ABCDE";

function pixel(image, x, y) {
  const px = Math.round(x), py = Math.round(y);
  if (px < 0 || py < 0 || px >= image.width || py >= image.height) return [255, 255, 255];
  const offset = (py * image.width + px) * 4;
  return image.data.subarray(offset, offset + 3);
}

function pink(image, x, y) {
  const [r, g, b] = pixel(image, x, y);
  return r > 130 && r > g + 25 && r > b + 25;
}

function grayscaleInk(image, x, y) {
  const [r, g, b] = pixel(image, x, y);
  return Math.max(r, g, b) - Math.min(r, g, b) < 18 && (r + g + b) / 3 < 245;
}

function framePeak(image, axis, start, end, crossStart, crossEnd, crossStep, predicate = pink) {
  let best = { position: -1, score: 0 };
  const scores = [];
  for (let position = Math.round(start); position <= Math.round(end); position += 1) {
    let score = 0;
    for (let cross = Math.round(crossStart); cross < crossEnd; cross += crossStep) {
      if (predicate(image, axis === "x" ? position : cross, axis === "x" ? cross : position)) score += 1;
    }
    if (score > best.score) best = { position, score };
    scores.push({ position, score });
  }
  const plateau = scores.filter((item) => item.score >= best.score * 0.96);
  return { position: plateau.length ? plateau.reduce((sum, item) => sum + item.position, 0) / plateau.length : best.position, score: best.score };
}

function findFrame(image) {
  const sx = image.width / 703, sy = image.height / 994;
  const locate = (axis, start, end, crossStart, crossEnd, crossStep, threshold) => {
    const pinkPeak = framePeak(image, axis, start, end, crossStart, crossEnd, crossStep);
    if (pinkPeak.score >= threshold) return pinkPeak;
    return framePeak(image, axis, start, end, crossStart, crossEnd, crossStep, grayscaleInk);
  };
  const left = locate("x", 25 * sx, 65 * sx, 300 * sy, 930 * sy, Math.max(1, Math.round(3 * sy)), 80);
  const right = locate("x", 650 * sx, 690 * sx, 300 * sy, 930 * sy, Math.max(1, Math.round(3 * sy)), 80);
  const top = locate("y", 275 * sy, 295 * sy, 50 * sx, 655 * sx, Math.max(1, Math.round(3 * sx)), 70);
  const bottom = locate("y", 945 * sy, 970 * sy, 50 * sx, 655 * sx, Math.max(1, Math.round(3 * sx)), 70);
  if (left.score < 80 || right.score < 80 || top.score < 70 || bottom.score < 70) {
    throw new Error("The UoL answer-sheet frame could not be located. Check that the page is upright and fully visible.");
  }
  return { left: left.position, right: right.position, top: top.position, bottom: bottom.position };
}

function darkFraction(image, x, y, radiusX, radiusY) {
  let dark = 0, total = 0;
  for (let dy = -radiusY; dy <= radiusY; dy += 1) {
    for (let dx = -radiusX; dx <= radiusX; dx += 1) {
      const [r, g, b] = pixel(image, x + dx, y + dy);
      if ((r * 299 + g * 587 + b * 114) / 1000 < 150) dark += 1;
      total += 1;
    }
  }
  return dark / total;
}

function localInk(image, x, y, radius) {
  let total = 0, count = 0;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const [r, g, b] = pixel(image, x + dx, y + dy);
      total += 255 - (r * 299 + g * 587 + b * 114) / 1000;
      count += 1;
    }
  }
  return total / Math.max(1, count);
}

function inferredQuestionCount(answers) {
  // A master with fewer than 120 test questions has a dense marked prefix and
  // a blank suffix. Sparse scanner specks in the suffix cannot extend the test.
  let bestCount = 0, bestScore = -Infinity;
  for (let count = 1; count <= 120; count += 1) {
    let score = 0;
    for (let index = 0; index < 120; index += 1) {
      const marked = answers[index].selected.length > 0;
      score += Math.log(index < count ? (marked ? 0.97 : 0.03) : (marked ? 0.02 : 0.98));
    }
    if (score > bestScore) { bestScore = score; bestCount = count; }
  }
  return bestCount;
}

export function readLegacyAnswerImage(image) {
  const frame = findFrame(image);
  const scaleX = (frame.right - frame.left) / (REFERENCE.right - REFERENCE.left);
  const scaleY = (frame.bottom - frame.top) / (REFERENCE.bottom - REFERENCE.top);
  const mapX = (value) => frame.left + (value - REFERENCE.left) * scaleX;
  const mapY = (value) => frame.top + (value - REFERENCE.top) * scaleY;
  const radiusX = Math.max(2, Math.round(4 * scaleX));
  const radiusY = Math.max(2, Math.round(4 * scaleY));
  const answers = [];
  for (let index = 0; index < 120; index += 1) {
    const column = Math.floor(index / 30), row = index % 30;
    const y = 319 + (row % 5) * 16.2 + Math.floor(row / 5) * 110.5;
    const signals = [...CHOICES].map((label, choice) => ({
      label, strength: darkFraction(image, mapX(ANSWER_X[column] + choice * 16.7), mapY(y), radiusX, radiusY),
    }));
    const selected = signals.filter((signal) => signal.strength >= 0.035).map((signal) => signal.label);
    const borderline = signals.some((signal) => signal.strength >= 0.02);
    answers.push({ question: index + 1, selected, response: selected.length === 1 ? selected[0] : "",
      status: selected.length > 1 ? "multiple" : selected.length === 1 ? "marked" : borderline ? "uncertain" : "blank" });
  }
  const questionCount = inferredQuestionCount(answers);
  return { answers, questionCount, frame };
}

export function mapLegacyPoint(frame, x, y) {
  return {
    x: frame.left + (x - REFERENCE.left) * (frame.right - frame.left) / (REFERENCE.right - REFERENCE.left),
    y: frame.top + (y - REFERENCE.top) * (frame.bottom - frame.top) / (REFERENCE.bottom - REFERENCE.top),
  };
}

// Read one strongest response per question and one strongest digit per ID
// column. The grayscale ink signal also works when pink form artwork has been
// converted to black and white by a copier or scanner.
export function readLegacyStudentPage(image, questionLimit = 70) {
  const { answers, frame } = readLegacyAnswerImage(image);
  const scaleX = (frame.right - frame.left) / (REFERENCE.right - REFERENCE.left);
  const scaleY = (frame.bottom - frame.top) / (REFERENCE.bottom - REFERENCE.top);
  const mapX = (value) => frame.left + (value - REFERENCE.left) * scaleX;
  const mapY = (value) => frame.top + (value - REFERENCE.top) * scaleY;
  const radiusX = Math.max(2, Math.round(4 * scaleX));
  const radiusY = Math.max(2, Math.round(4 * scaleY));
  const faintRadius = Math.max(1, Math.round(2 * Math.min(scaleX, scaleY)));
  const answerXs = [75, 242, 408, 583];
  const resolvedAnswers = answers.slice(0, Math.min(120, questionLimit)).map((answer, index) => {
    const column = Math.floor(index / 30), row = index % 30;
    const y = 319 + (row % 5) * 16.2 + Math.floor(row / 5) * 110.5;
    const signals = [...CHOICES].map((label, choice) => ({
      label,
      strength: darkFraction(image, mapX(answerXs[column] + choice * 16.7), mapY(y), radiusX, radiusY),
      faintStrength: localInk(image, mapX(answerXs[column] + choice * 16.7), mapY(y), faintRadius),
    }));
    const strongest = signals.reduce((best, signal) => signal.strength > best.strength ? signal : best, signals[0]);
    const faintest = signals.reduce((best, signal) => signal.faintStrength > best.faintStrength ? signal : best, signals[0]);
    const useFaintFallback = strongest.strength < 0.035;
    const chosen = useFaintFallback ? faintest : strongest;
    const response = chosen.label;
    return { question: answer.question, selected: response ? [response] : [], response,
      status: useFaintFallback ? "faint" : "marked", strength: useFaintFallback ? chosen.faintStrength : chosen.strength };
  });

  let partialId = "";
  const uncertainColumns = [];
  for (let column = 0; column < 9; column += 1) {
    const signals = Array.from({ length: 10 }, (_, digit) => {
      const point = mapLegacyPoint(frame, 517 + column * 16.8, 137 + digit * 13.0);
      return { digit, strength: darkFraction(image, point.x, point.y, radiusX, radiusY),
        faintStrength: localInk(image, point.x, point.y, faintRadius) };
    }).sort((a, b) => b.strength - a.strength);
    const strongest = signals[0], next = signals[1];
    const faint = [...signals].sort((a, b) => b.faintStrength - a.faintStrength);
    const faintest = faint[0], nextFaintest = faint[1];
    if (strongest.strength >= 0.14 && strongest.strength - next.strength >= 0.045) partialId += String(strongest.digit);
    else if (faintest.faintStrength - nextFaintest.faintStrength >= 0.75) partialId += String(faintest.digit);
    else {
      partialId += "?";
      if (strongest.strength >= 0.10 || faintest.faintStrength >= 4) uncertainColumns.push(column + 1);
    }
  }
  const studentId = /^\d{9}$/.test(partialId) ? partialId : "";
  return { answers: resolvedAnswers, frame, studentId, partialId, uncertainColumns };
}
