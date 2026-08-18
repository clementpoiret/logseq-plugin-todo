import '@logseq/libs/dist/LSPlugin';

declare module '@logseq/libs/dist/LSPlugin' {
  interface IAppProxy {
    checkCurrentIsDbGraph?: () => Promise<boolean>;
  }

  interface IEditorProxy {
    getTodayPage: () => Promise<PageEntity | null>;
    createJournalPage: (date: string | Date) => Promise<PageEntity | null>;
    getTag: (nameOrIdent: string | EntityID) => Promise<PageEntity | null>;
    addBlockTag: (blockId: BlockIdentity, tagId: BlockIdentity) => Promise<void>;
  }

  interface BlockEntity {
    title?: string;
  }
}
