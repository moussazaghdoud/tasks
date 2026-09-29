import { describe, expect, it } from 'vitest';
import { splitThoughts } from './spokenCommands';

describe('splitThoughts', () => {
  it('starts a new thought on "new line" in each language', () => {
    expect(splitThoughts('Call Paul new line buy bread')).toEqual(['Call Paul', 'Buy bread']);
    expect(splitThoughts('Appeler Paul à la ligne acheter du pain')).toEqual(['Appeler Paul', 'Acheter du pain']);
    expect(splitThoughts('Appeler Paul, retour à la ligne, acheter du pain.')).toEqual(['Appeler Paul', 'Acheter du pain']);
    expect(splitThoughts('Appeler Paul nouvelle ligne acheter du pain')).toEqual(['Appeler Paul', 'Acheter du pain']);
    expect(splitThoughts('给保罗打电话换行买面包')).toEqual(['给保罗打电话', '买面包']);
    expect(splitThoughts('给保罗打电话，另起一行，买面包')).toEqual(['给保罗打电话', '买面包']);
  });

  it('treats "enter" and "entrée" as the same, when they stand alone', () => {
    expect(splitThoughts('Call Paul. Enter. Buy bread')).toEqual(['Call Paul', 'Buy bread']);
    expect(splitThoughts('Call Paul, enter')).toEqual(['Call Paul']);
    expect(splitThoughts('Appeler Paul entrée acheter du pain')).toEqual(['Appeler Paul', 'Acheter du pain']);
  });

  it('leaves "enter" and "entrée" alone when they are part of the sentence', () => {
    expect(splitThoughts('Enter the figures in the budget')).toEqual(['Enter the figures in the budget']);
    expect(splitThoughts('Réserver une table près de l’entrée')).toEqual(['Réserver une table près de l’entrée']);
    expect(splitThoughts('Choisir une entrée pour samedi')).toEqual(['Choisir une entrée pour samedi']);
  });

  it('keeps a thought with no command in one piece', () => {
    expect(splitThoughts('Call Paul about the contract')).toEqual(['Call Paul about the contract']);
    expect(splitThoughts('')).toEqual([]);
  });

  it('ignores a command said at the start, the end, or twice', () => {
    expect(splitThoughts('new line Call Paul new line new line')).toEqual(['Call Paul']);
  });
});
