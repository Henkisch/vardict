import type {StructureResolver} from 'sanity/structure'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('VARdict')
    .items([
      S.documentTypeListItem('incident').title('Incidents'),
      S.documentTypeListItem('match').title('Matches'),
      S.documentTypeListItem('team').title('Teams'),
      S.documentTypeListItem('law').title('Laws of the Game'),
      S.documentTypeListItem('punditLine').title('Pundit lines'),
      S.divider(),
      S.listItem()
        .title('Live data (written by the workflow)')
        .child(
          S.list()
            .title('Live data')
            .items([
              S.documentTypeListItem('referendum').title('Referendums'),
              S.documentTypeListItem('vote').title('Votes'),
            ]),
        ),
    ])
