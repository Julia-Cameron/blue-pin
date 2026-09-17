import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { pool } from './db.js';

dotenv.config();

const hasSupabaseStorage = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const supabase = hasSupabaseStorage
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;
const app = express();
const PORT = Number(process.env.PORT) || 5000;
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
const localUploadDirectory = path.resolve('uploads');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(localUploadDirectory));

const hashFile = (file) => crypto.createHash('sha256').update(file.buffer).digest('hex');

const createTables = async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS documents (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            revision TEXT,
            uploader_name TEXT NOT NULL,
            uploader_position TEXT,
            uploader_phone TEXT,
            uploader_email TEXT NOT NULL,
            file_url TEXT NOT NULL,
            file_name TEXT,
            file_hash TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS markups (
            id SERIAL PRIMARY KEY,
            document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
            commentor_name TEXT NOT NULL,
            commentor_position TEXT,
            commentor_phone TEXT,
            commentor_email TEXT NOT NULL,
            x_coord INTEGER,
            y_coord INTEGER,
            comment TEXT NOT NULL,
            parent_id INTEGER,
            fixed_file_url TEXT,
            fixed_file_name TEXT,
            fixed_file_hash TEXT,
            fixed_revision TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await pool.query('ALTER TABLE documents DISABLE ROW LEVEL SECURITY');
    await pool.query('ALTER TABLE markups DISABLE ROW LEVEL SECURITY');

    await pool.query('ALTER TABLE markups ADD COLUMN IF NOT EXISTS parent_id INTEGER');
    await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name TEXT');
    await pool.query('ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_hash TEXT');
    await pool.query('ALTER TABLE markups ADD COLUMN IF NOT EXISTS fixed_file_url TEXT');
    await pool.query('ALTER TABLE markups ADD COLUMN IF NOT EXISTS fixed_file_name TEXT');
    await pool.query('ALTER TABLE markups ADD COLUMN IF NOT EXISTS fixed_file_hash TEXT');
    await pool.query('ALTER TABLE markups ADD COLUMN IF NOT EXISTS fixed_revision TEXT');

};

const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
        const allowedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
        const extension = path.extname(file.originalname).toLowerCase();
        callback(null, allowedExtensions.includes(extension));
    }
});

const phoneRegex = /^\(\d{3}\)\d{3}-\d{4}$/;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isCapitalizedPhrase = (value) => value.trim().split(/\s+/).every((word) => /^[A-Z]/.test(word));

const validatePerson = (name, position, email, phone) => {
    if (!name || !position || !email) return 'Name, position, and email are required.';
    if (!isCapitalizedPhrase(name) || !isCapitalizedPhrase(position)) {
        return 'Names and positions must start each word with an uppercase letter.';
    }
    if (!emailRegex.test(email)) return 'Invalid email address format.';
    if (phone && !phoneRegex.test(phone)) return 'Invalid phone number format. Expected (xxx)xxx-xxxx.';
    return null;
};

const normalizeFileName = (fileName) => fileName.trim().toLowerCase();
const getStoragePath = (file) => `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`;

const uploadToSupabase = async (file) => {
    const storagePath = getStoragePath(file);
    if (!hasSupabaseStorage) {
        await fs.mkdir(localUploadDirectory, { recursive: true });
        await fs.writeFile(path.join(localUploadDirectory, storagePath), file.buffer);
        return { storagePath, url: `/uploads/${storagePath}` };
    }

    const { error } = await supabase.storage.from(storageBucket).upload(storagePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
    });
    if (error) throw error;

    const { data } = supabase.storage.from(storageBucket).getPublicUrl(storagePath);
    return { storagePath, url: data.publicUrl };
};

const removeFromSupabase = async (storagePath) => {
    if (!storagePath) return;
    if (!hasSupabaseStorage) {
        await fs.rm(path.join(localUploadDirectory, storagePath), { force: true });
        return;
    }
    await supabase.storage.from(storageBucket).remove([storagePath]);
};

const ensureStorageBucket = async () => {
    if (!hasSupabaseStorage) {
        await fs.mkdir(localUploadDirectory, { recursive: true });
        return;
    }

    const { data: bucket, error: getError } = await supabase.storage.getBucket(storageBucket);
    if (bucket) {
        const { error: updateError } = await supabase.storage.updateBucket(storageBucket, { public: true });
        if (updateError) throw updateError;
        return;
    }
    if (getError && !getError.message.toLowerCase().includes('not found')) throw getError;

    const { error: createError } = await supabase.storage.createBucket(storageBucket, { public: true });
    if (createError && !createError.message.toLowerCase().includes('already exists')) throw createError;
};

const findDuplicateDocument = async (fileName, fileHash, revision) => {
    const { rows } = await pool.query(
        `SELECT 1 FROM documents
         WHERE file_hash = $1 OR (file_name = $2 AND COALESCE(revision, '') = $3)
         LIMIT 1`,
        [fileHash, fileName, revision]
    );
    return rows.length > 0;
};

const findDuplicateFixedFile = async (fileName, fileHash, revision) => {
    const { rows } = await pool.query(
        `SELECT 1 FROM documents
         WHERE file_name = $1 AND COALESCE(revision, '') = $2
         UNION ALL
         SELECT 1 FROM markups
         WHERE (fixed_file_name = $1 AND COALESCE(fixed_revision, '') = $2)
            OR (fixed_file_hash = $3 AND COALESCE(fixed_revision, '') = $2)
         LIMIT 1`,
        [fileName, revision, fileHash]
    );
    return rows.length > 0;
};

app.get('/api/documents', async (_req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM documents ORDER BY created_at DESC');
        res.json({ documents: rows });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/documents/:id/download', async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT file_url, file_name FROM documents WHERE id = $1',
            [req.params.id]
        );
        const document = rows[0];
        if (!document) return res.status(404).json({ message: 'Document not found.' });

        const fileName = document.file_name || `document-${req.params.id}`;
        if (document.file_url.startsWith('/uploads/')) {
            return res.download(path.join(localUploadDirectory, path.basename(document.file_url)), fileName);
        }

        const fileResponse = await fetch(document.file_url);
        if (!fileResponse.ok) {
            return res.status(502).json({ message: 'Unable to retrieve the uploaded file.' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/"/g, '')}"`);
        res.setHeader('Content-Type', fileResponse.headers.get('content-type') || 'application/octet-stream');
        res.send(Buffer.from(await fileResponse.arrayBuffer()));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.get('/api/documents/:id', async (req, res) => {
    try {
        const documentResult = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
        const document = documentResult.rows[0];
        if (!document) return res.status(404).json({ message: 'Document not found.' });

        const { rows: markups } = await pool.query(
            'SELECT * FROM markups WHERE document_id = $1 ORDER BY created_at ASC',
            [req.params.id]
        );
        res.json({ document, markups });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/documents', upload.single('blueprintFile'), async (req, res) => {
    const { title, revision, uploaderName, uploaderPosition, uploaderPhone, uploaderEmail } = req.body;
    const file = req.file;

    if (!title?.trim() || !file) return res.status(400).json({ message: 'Title and a PDF, PNG, or JPG file are required.' });
    const validationMessage = validatePerson(uploaderName?.trim(), uploaderPosition?.trim(), uploaderEmail?.trim(), uploaderPhone?.trim());
    if (validationMessage) return res.status(400).json({ message: validationMessage });
    const documentRevision = revision?.trim() || 'Rev 1.0';
    const fileName = normalizeFileName(file.originalname);
    const fileHash = hashFile(file);

    try {
        if (await findDuplicateDocument(fileName, fileHash, documentRevision)) {
            return res.status(409).json({ message: 'This file already exists or this filename already has that revision.' });
        }

        const uploadedFile = await uploadToSupabase(file);

        try {
            const { rows } = await pool.query(
                `INSERT INTO documents
                    (title, revision, uploader_name, uploader_position, uploader_phone, uploader_email, file_url, file_name, file_hash)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                [title.trim(), documentRevision, uploaderName.trim(), uploaderPosition.trim(), uploaderPhone?.trim() || null, uploaderEmail.trim(), uploadedFile.url, fileName, fileHash]
            );
            res.json({ message: 'Document uploaded successfully', id: rows[0].id });
        } catch (error) {
            await removeFromSupabase(uploadedFile.storagePath);
            throw error;
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.post('/api/documents/:id/markups', upload.single('fixedFile'), async (req, res) => {
    const { commentorName, commentorPosition, commentorPhone, commentorEmail, comment, parentId, fixedRevision } = req.body;
    const fixedFile = req.file;

    if (!comment?.trim()) return res.status(400).json({ message: 'A comment describing the issue or fix is required.' });
    if (fixedFile && !fixedRevision?.trim()) {
        return res.status(400).json({ message: 'A revision is required when uploading a fixed file.' });
    }
    const validationMessage = validatePerson(commentorName?.trim(), commentorPosition?.trim(), commentorEmail?.trim(), commentorPhone?.trim());
    if (validationMessage) return res.status(400).json({ message: validationMessage });

    const documentResult = await pool.query('SELECT id FROM documents WHERE id = $1', [req.params.id]);
    if (!documentResult.rows[0]) return res.status(404).json({ message: 'Document not found.' });

    const fixedFileName = fixedFile ? normalizeFileName(fixedFile.originalname) : null;
    const fixedFileHash = fixedFile ? hashFile(fixedFile) : null;
    const fixedFileRevision = fixedRevision?.trim() || null;

    try {
        if (fixedFile && await findDuplicateFixedFile(fixedFileName, fixedFileHash, fixedFileRevision)) {
            return res.status(409).json({ message: 'This file already exists or this filename already has that revision.' });
        }

        const uploadedFile = fixedFile ? await uploadToSupabase(fixedFile) : null;

        try {
            const { rows } = await pool.query(
                `INSERT INTO markups
                    (document_id, commentor_name, commentor_position, commentor_phone, commentor_email,
                     x_coord, y_coord, comment, parent_id, fixed_file_url, fixed_file_name, fixed_file_hash, fixed_revision)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
                [req.params.id, commentorName.trim(), commentorPosition.trim(), commentorPhone?.trim() || null, commentorEmail.trim(), 0, 0, comment.trim(), parentId || null, uploadedFile?.url || null, fixedFileName, fixedFileHash, fixedFileRevision]
            );
            res.json({ message: 'Markup saved successfully', id: rows[0].id });
        } catch (error) {
            await removeFromSupabase(uploadedFile?.storagePath);
            throw error;
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

app.delete('/api/documents/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
        const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM documents');
        if (rows[0].count === 0) {
            await pool.query("SELECT setval(pg_get_serial_sequence('documents', 'id'), 1, false)");
        }
        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

const start = async () => {
    try {
        await createTables();
        // Add '0.0.0.0' here so Render can route traffic to your app
        app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
    } catch (error) {
        console.error('Unable to start server:', error.message);
        process.exitCode = 1;
    }
};
start();
