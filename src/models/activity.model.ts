// MOCK STUB: Prevent compiler errors for audit activity log calls without database overhead
export const Activity = {
  create: async (data: any) => Promise.resolve(data),
  find: () => ({
    populate: () => ({
      populate: () => ({
        sort: () => ({
          limit: () => Promise.resolve([]),
        }),
      }),
      sort: () => ({
        limit: () => Promise.resolve([]),
      }),
    }),
    sort: () => ({
      limit: () => Promise.resolve([]),
    }),
  }),
} as any;
