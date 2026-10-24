import { analyserNettoyage, appliquerCorrections } from './nettoyage';

describe('nettoyage', () => {
  it('detecte les variantes de texte et la casse', () => {
    const donnees = [
      { ville: 'Abidjan' },
      { ville: 'abidjan' },
      { ville: 'Abidjan' },
      { ville: 'ABIDJAN' }
    ];

    const rapport = analyserNettoyage(donnees);
    expect(rapport.suggestionsParColonne['ville']).toBeDefined();
    expect(rapport.suggestionsParColonne['ville'].length).toBeGreaterThan(0);
  });

  it('applique les corrections demandees', () => {
    const donnees = [
      { ville: 'Abidjan' },
      { ville: 'abidjan' }
    ];

    const corrections = [
      { colonne: 'ville', valeurOriginale: 'abidjan', valeurSuggeree: 'Abidjan' }
    ];

    const donneesPropres = appliquerCorrections(donnees, corrections);
    expect(donneesPropres[1].ville).toBe('Abidjan');
  });
});