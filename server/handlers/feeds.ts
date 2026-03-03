import type { Repository } from '../db/repository.js';
import { validateAdminSecret } from '../security.js';

export async function handleFeeds(
  request: Request,
  repo: Repository,
  action: string | null,
  adminSecret: string | undefined,
): Promise<Response> {
  try {
    console.log(`[API Feeds] Method: ${request.method}, Action: ${action}`);

    // ── GET: List feeds (public or admin) ──
    if (request.method === 'GET' && action === 'summary') {
      const summaries = await repo.getFeedSummaries();
      return Response.json(summaries);
    }

    if (request.method === 'GET' || (request.method === 'POST' && action === 'admin')) {
      if (action === 'admin') {
        if (!validateAdminSecret(request.headers, adminSecret)) {
          return Response.json({ error: 'Unauthorized: Invalid Admin Secret' }, { status: 401 });
        }
        const allFeeds = await repo.listFeeds();
        return Response.json(allFeeds);
      }

      // Public list (hides URL)
      const allFeeds = await repo.listFeeds();
      const safeFeeds = allFeeds.map(f => ({
        id: f.id,
        category: f.category,
        isSub: f.isSub || false,
        customTitle: f.customTitle || '',
        canProxyImages: true,
      }));
      return Response.json(safeFeeds);
    }

    // ── POST: Manage feeds (requires admin secret) ──
    if (request.method === 'POST') {
      if (!adminSecret) {
        return Response.json({ error: 'Admin secret is not configured on server.' }, { status: 503 });
      }
      if (!validateAdminSecret(request.headers, adminSecret)) {
        return Response.json({ error: 'Unauthorized: Invalid Admin Secret' }, { status: 401 });
      }

      const body = await request.json() as any;

      // Add or Update Feed
      if (action === 'add' || action === 'update') {
        const { id, url, category, isSub, customTitle, allowedMediaHosts } = body;
        if (!id || !url) {
          return Response.json({ error: 'Missing ID or URL' }, { status: 400 });
        }
        await repo.upsertFeed({
          id,
          url,
          category,
          isSub: !!isSub,
          customTitle: customTitle || '',
          allowedMediaHosts: allowedMediaHosts ? JSON.stringify(allowedMediaHosts) : null,
        });
        return Response.json({ success: true });
      }

      // Delete Feed
      if (action === 'delete') {
        const { id } = body;
        if (!id) {
          return Response.json({ error: 'Missing ID' }, { status: 400 });
        }
        const deleted = await repo.deleteFeed(id);
        if (deleted === 0) {
          return Response.json({ error: `Feed with id '${id}' not found.` }, { status: 404 });
        }
        return Response.json({ success: true });
      }

      // Reorder Feeds
      if (action === 'reorder') {
        const { ids } = body;
        if (!Array.isArray(ids) || ids.length === 0) {
          return Response.json({ error: 'Invalid input: ids must be a non-empty array' }, { status: 400 });
        }
        const uniqueIds = Array.from(new Set(ids));
        if (uniqueIds.length !== ids.length) {
          return Response.json({ error: 'Duplicate feed ids are not allowed' }, { status: 400 });
        }
        try {
          await repo.reorderFeeds(uniqueIds);
        } catch (err: any) {
          if (err.message === 'One or more feeds not found') {
            return Response.json({ error: err.message }, { status: 404 });
          }
          throw err;
        }
        return Response.json({ success: true });
      }

      return Response.json({ error: 'Invalid action parameter' }, { status: 400 });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Server Error] [API Error]', error);
    return Response.json({ error: 'Internal server error', details: errorMessage }, { status: 500 });
  }
}
