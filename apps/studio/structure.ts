import type {StructureResolver} from 'sanity/structure'
import {CLAIM_SUBJECTS, SUBJECT_LABELS} from '@gate-check/content-model'

/**
 * The Studio is where somebody audits this dataset, so it is organised around the
 * questions an auditor actually asks — which claims disagree, which sources are
 * weak, what decisions are outstanding — rather than around document types.
 */
export const structure: StructureResolver = (S) =>
  S.list()
    .title('Gate Check')
    .items([
      S.listItem()
        .title('Needs a decision')
        .child(
          S.list()
            .title('Needs a decision')
            .items([
              S.listItem()
                .title('Proposed rulings (unsigned)')
                .child(
                  S.documentList()
                    .title('Proposed rulings')
                    .filter('_type == "ruling" && status == "proposed"')
                    .defaultOrdering([{field: '_createdAt', direction: 'desc'}]),
                ),
              S.listItem()
                .title('Signed rulings')
                .child(S.documentList().title('Signed rulings').filter('_type == "ruling" && status == "signed"')),
              S.listItem()
                .title('Claims recorded as uncertain')
                .child(
                  S.documentList()
                    .title('Uncertain claims')
                    .filter('_type == "claim" && confidence == "uncertain"'),
                ),
              S.listItem()
                .title('Claims from low-authority sources')
                .child(
                  S.documentList()
                    .title('Third-party and marketing sources')
                    .filter('_type == "claim" && source->docType in ["third-party", "marketing-page"]'),
                ),
            ]),
        ),

      S.divider(),

      S.listItem()
        .title('Claims by subject')
        .child(
          S.list()
            .title('Subjects')
            .items(
              CLAIM_SUBJECTS.map((subject) =>
                S.listItem()
                  .id(subject)
                  .title(SUBJECT_LABELS[subject])
                  .child(
                    S.documentList()
                      .title(SUBJECT_LABELS[subject])
                      .filter('_type == "claim" && subject == $subject')
                      .params({subject})
                      .defaultOrdering([{field: 'bindingMode', direction: 'asc'}]),
                  ),
              ),
            ),
        ),

      S.listItem()
        .title('Claims by binding mode')
        .child(
          S.list()
            .title('Binding mode')
            .items(
              [
                ['ceiling', 'Ceilings — nobody may exceed these'],
                ['floor', 'Floors — baselines operators may tighten'],
                ['override', 'Overrides — a carrier’s own figure'],
              ].map(([mode, title]) =>
                S.listItem()
                  .id(mode!)
                  .title(title!)
                  .child(
                    S.documentList()
                      .title(title!)
                      .filter('_type == "claim" && bindingMode == $mode')
                      .params({mode}),
                  ),
              ),
            ),
        ),

      S.divider(),

      S.documentTypeListItem('sourceDoc').title('Source documents'),
      S.documentTypeListItem('claim').title('All claims'),
      S.documentTypeListItem('ruling').title('All rulings'),

      S.divider(),

      S.documentTypeListItem('itinerary').title('Itineraries'),
      S.documentTypeListItem('bagItem').title('Items'),
      S.documentTypeListItem('checkRun').title('Check runs (written by the app)'),

      S.divider(),

      S.documentTypeListItem('carrier').title('Carriers'),
      S.documentTypeListItem('aircraftType').title('Aircraft types'),
      S.documentTypeListItem('jurisdiction').title('Jurisdictions'),
    ])
