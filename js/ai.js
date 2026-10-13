// Extension point for future AI features (photo import of boards/old reports,
// observation wording + regulation/code suggestions). Version 1 ships with no AI:
// every function reports "not available" so the UI can hide the buttons.
// To add later: implement a provider that calls an AI API (key held server-side
// or entered by the user in Settings) and return data in these shapes.

export const ai = {
  available(settings) { return !!settings?.aiProvider?.enabled && !!settings?.aiProvider?.endpoint; },
  /** @returns {Promise<Array<Partial<import('./model.js').Circuit>>>} circuits read from a CU photo */
  async importBoardPhoto(/* imageDataUrl, settings */) { throw new Error('AI photo import is not enabled yet'); },
  /** @returns {Promise<Object>} partial job read from a photo/PDF of a previous EICR */
  async importPreviousReport(/* imageDataUrl, settings */) { throw new Error('AI report import is not enabled yet'); },
  /** @returns {Promise<{desc:string, code:string, reg:string}>} tidied observation */
  async suggestObservation(/* text, settings */) { throw new Error('AI suggestions are not enabled yet'); },
};
