/**
 * Floorplanner FML License V01c (2024-10-04):
 * elke plattegrond die de FML-standaard gebruikt moet deze zin in het bestand
 * hebben. Geen `.plg`-veld; Floorplanner negeert onbekende keys.
 *
 * Later: editor-URL bijvoegen zodra de losse editor live is. De zin hieronder
 * moet letterlijk blijven staan.
 */
export const FML_STANDARD_NOTICE =
  'This floorplan has been created by using the FML Standard (https://floorplanner.com/fml/)'

export const FML_STANDARD_NOTICE_KEY = 'fmlStandardNotice'

export function fmlExportNotice(): string {
  return FML_STANDARD_NOTICE
}
