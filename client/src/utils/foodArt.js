export function getFoodArt(categories = []) {
  const cats = categories.map(c => c.toLowerCase());
  if (cats.some(c => c.includes('breakfast') || c.includes('brunch')))
    return [
      "  . .  ",
      " (o o) ",
      "  '-'  ",
      " ===== ",
    ].join('\n');
  if (cats.some(c => c.includes('dessert') || c.includes('cake') || c.includes('cookie') || c.includes('sweet') || c.includes('pastry')))
    return [
      "  ***  ",
      " /   \\ ",
      "|     |",
      " \\___/ ",
    ].join('\n');
  if (cats.some(c => c.includes('soup') || c.includes('stew') || c.includes('chili') || c.includes('chowder')))
    return [
      "  ___  ",
      " /~~~\\ ",
      "| (o) |",
      " \\___/ ",
    ].join('\n');
  if (cats.some(c => c.includes('pasta') || c.includes('italian') || c.includes('noodle') || c.includes('lasagna')))
    return [
      " ~~~~  ",
      " {({}  ",
      " {({}  ",
      " ~~~~  ",
    ].join('\n');
  if (cats.some(c => c.includes('salad') || c.includes('vegetarian') || c.includes('vegan') || c.includes('greens')))
    return [
      " (( )) ",
      " (( )) ",
      "  |||  ",
      "  |||  ",
    ].join('\n');
  if (cats.some(c => c.includes('sandwich') || c.includes('burger') || c.includes('wrap')))
    return [
      " ~~~~~ ",
      "|     |",
      "|=====|",
      "|_____|",
    ].join('\n');
  if (cats.some(c => c.includes('drink') || c.includes('cocktail') || c.includes('juice') || c.includes('smoothie')))
    return [
      "  ,-.  ",
      " |   | ",
      " | ~ | ",
      "  '-'  ",
    ].join('\n');
  if (cats.some(c => c.includes('bbq') || c.includes('grill') || c.includes('meat') || c.includes('steak')))
    return [
      " /\\  /\\",
      "|  ||  |",
      "|  ||  |",
      " \\____/",
    ].join('\n');
  return [
    "  ___  ",
    " (   ) ",
    "|=====|",
    " |   | ",
  ].join('\n');
}
