import { describe, expect, it } from 'vitest';
import { withLineBreaks } from './spokenCommands';

describe('withLineBreaks', () => {
  it('turns "new line" into a line break, in each language', () => {
    expect(withLineBreaks('Shopping list new line bread new line milk')).toBe('Shopping list\nBread\nMilk');
    expect(withLineBreaks('Liste de courses à la ligne pain à la ligne lait')).toBe('Liste de courses\nPain\nLait');
    expect(withLineBreaks('Liste de courses, retour à la ligne, pain.')).toBe('Liste de courses\nPain');
    expect(withLineBreaks('Liste de courses nouvelle ligne pain')).toBe('Liste de courses\nPain');
    expect(withLineBreaks('购物清单换行面包')).toBe('购物清单\n面包');
    expect(withLineBreaks('购物清单，另起一行，面包')).toBe('购物清单\n面包');
  });

  it('breaks the line in Italian, Spanish, German and Arabic', () => {
    expect(withLineBreaks('Spesa a capo pane a capo latte')).toBe('Spesa\nPane\nLatte');
    expect(withLineBreaks('Marco è a capo del progetto')).toBe('Marco è a capo del progetto');
    expect(withLineBreaks('Compra nueva línea pan nueva línea leche')).toBe('Compra\nPan\nLeche');
    expect(withLineBreaks('Einkauf neue Zeile Brot neue Zeile Milch')).toBe('Einkauf\nBrot\nMilch');
    expect(withLineBreaks('قائمة التسوق سطر جديد خبز سطر جديد حليب')).toBe('قائمة التسوق\nخبز\nحليب');
  });

  it('treats "enter" and "entrée" the same, when they stand alone', () => {
    expect(withLineBreaks('Call Paul. Enter. About the contract')).toBe('Call Paul\nAbout the contract');
    expect(withLineBreaks('Appeler Paul entrée pour le contrat')).toBe('Appeler Paul\nPour le contrat');
  });

  it('leaves "enter" and "entrée" alone when they are part of the sentence', () => {
    expect(withLineBreaks('Enter the figures in the budget')).toBe('Enter the figures in the budget');
    expect(withLineBreaks('Réserver une table près de l’entrée')).toBe('Réserver une table près de l’entrée');
    expect(withLineBreaks('Choisir une entrée pour samedi')).toBe('Choisir une entrée pour samedi');
  });

  it('keeps a thought with no command exactly as said', () => {
    expect(withLineBreaks('Call Paul about the contract.')).toBe('Call Paul about the contract.');
  });

  it('drops empty lines from a command said at the start, the end, or twice', () => {
    expect(withLineBreaks('new line Call Paul new line new line')).toBe('Call Paul');
  });
});
