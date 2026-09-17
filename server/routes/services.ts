import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db.ts';

export const servicesRouter = Router();

// GET all active services (with optional platform filter)
servicesRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { platform, type } = req.query;
    let sql = 'SELECT * FROM services WHERE is_active = 1';
    const params: any[] = [];

    if (platform && typeof platform === 'string' && platform !== 'all') {
      sql += ' AND platform = ?';
      params.push(platform.toLowerCase());
    }

    if (type && typeof type === 'string' && type !== 'all') {
      sql += ' AND service_type = ?';
      params.push(type.toLowerCase());
    }

    sql += ' ORDER BY platform ASC, coin_price_per_1000 DESC';

    const services = await query(sql, params);
    res.json({ services });
  } catch (err: any) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: 'Failed to retrieve services catalog.' });
  }
});

// GET specific service
servicesRouter.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const service = await queryOne('SELECT * FROM services WHERE id = ?', [req.params.id]);
    if (!service) {
      res.status(404).json({ error: 'Service not found.' });
      return;
    }
    res.json({ service });
  } catch (err: any) {
    console.error('Error fetching service:', err);
    res.status(500).json({ error: 'Failed to retrieve service.' });
  }
});
