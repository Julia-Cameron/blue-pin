# BluePin

BluePin is a browser-based engineering document review dashboard. Teams can upload blueprint files, capture uploader and reviewer details, discuss issues through threaded markups, and attach fixed revisions to the review history.

The application uses a small Express API with PostgreSQL persistence and a static HTML/CSS/JavaScript interface. It supports Supabase Storage in hosted environments and a local `uploads/` directory when Supabase storage is not configured.

## Features

- Upload PDF, PNG, JPG, and JPEG blueprint files
- Record uploader and reviewer name, position, phone, and email details
- Validate capitalization, email addresses, and phone numbers
- Prevent duplicate files by filename/revision or SHA-256 content hash
- Add comments and threaded replies to a document
- Attach a fixed file and revision identifier to a markup
- View and download original files and fixed revisions
- Automatically create and update the PostgreSQL tables needed by the application
- Switch between dark and light themes
- Persist the selected theme in the browser
- Responsive dashboard and document inspector layouts
- Deploy with the included Render configuration

## Technology

- Node.js with ECMAScript modules
- Express 5
- PostgreSQL with `pg`
- Multer for in-memory multipart upload handling
- Supabase Storage SDK for hosted file storage
- Static HTML, CSS, and browser JavaScript
- Tailwind CDN utilities used by generated document markup
- Render deployment configuration

## Requirements

- Node.js 18 or newer recommended
- npm
- PostgreSQL database
- Supabase project with a service-role key for cloud file storage, optional for local development

## Project Layout

```text
bluepin/
├── public/
│   ├── index.html       Dashboard markup and browser logic
│   └── styles.css       Dark/light theme and responsive UI styles
├── src/
│   ├── db.js            PostgreSQL connection pool
│   └── index.js         Express server, database setup, and API routes
├── Images/              Project image assets
├── uploads/             Local storage fallback, ignored except for .gitkeep
├── package.json         Scripts and dependencies
├── package-lock.json    Locked dependency versions
├── render.yaml          Render service configuration
└── README.md            Project documentation
```

## Installation

Clone the repository and install the locked dependencies:

```bash
git clone https://github.com/Julia-Cameron/BluePin.git
cd BluePin
npm ci
```

Use `npm install` instead of `npm ci` if you are intentionally updating dependencies.

## Environment Configuration

Create a `.env` file in the project root. Do not commit this file.

```env
DATABASE_URL=postgresql://username:password@host:5432/database
PORT=5000

# Optional cloud storage configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=uploads
```

### Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | HTTP port; defaults to `5000` |
| `SUPABASE_URL` | No | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase server-side service-role key |
| `SUPABASE_STORAGE_BUCKET` | No | Storage bucket name; defaults to `uploads` |
| `NODE_ENV` | No | Set to `production` to enable PostgreSQL SSL configuration |

When both Supabase variables are present, files are uploaded to the configured public Supabase bucket. When they are absent, files are written to `uploads/` and served through `/uploads/`.

## Running Locally

Start the server:

```bash
npm start
```

Then open [http://localhost:5000](http://localhost:5000).

On startup, BluePin connects to PostgreSQL, creates the `documents` and `markups` tables if needed, applies missing columns, ensures the storage location is available, and starts the Express server.

There is currently no automated test suite configured. The `npm test` script is a placeholder and exits with an error until tests are added.

## Application Workflow

### Upload a blueprint

1. Enter a title and revision code.
2. Enter the uploader's full name, position, email, and optional phone number.
3. Select a PDF, PNG, JPG, or JPEG file no larger than 10 MB.
4. Select **Upload Blueprint**.

Names and positions must have an uppercase first letter for every word. Phone numbers use the format `(416)555-0192`.

### Review a document

1. Select **View Details & Comments** from the document library or search by document ID.
2. Review the original file, uploader details, fixed revisions, and existing comments.
3. Use the comment form to add a review note or reply.
4. Optionally attach a fixed file with a revision identifier.

### Theme selection

Use the theme button in the top toolbar to switch between dark and light themes. The selection is stored in browser `localStorage` under `bluepin-theme` and is restored on the next visit.

## Database Schema

The server creates these tables automatically:

### `documents`

Stores uploaded blueprint metadata, revision information, uploader contact details, file URL, original filename, SHA-256 hash, and creation timestamp.

### `markups`

Stores comments and replies linked to a document. It includes reviewer details, optional coordinates, `parent_id` for reply relationships, fixed revision metadata, fixed file URL/name/hash, and creation timestamp.

The application also disables Row Level Security on these tables during startup because the server accesses PostgreSQL directly through its connection pool. Configure database access and network permissions appropriately for your environment.

## API Reference

All API responses are JSON unless a download is being returned. Upload endpoints use `multipart/form-data`.

### Documents

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/documents` | List documents ordered by newest first |
| `GET` | `/api/documents/:id` | Get one document and its markups |
| `POST` | `/api/documents` | Upload a new blueprint |
| `DELETE` | `/api/documents/:id` | Delete a document and its database record |
| `GET` | `/api/documents/:id/download` | Download the original blueprint |

`POST /api/documents` expects these form fields:

```text
title
revision
uploaderName
uploaderPosition
uploaderPhone
uploaderEmail
blueprintFile
```

### Markups

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/documents/:id/markups` | Add a comment, reply, or fixed revision |
| `GET` | `/api/documents/:documentId/markups/:markupId/download` | Download an attached fixed revision |

`POST /api/documents/:id/markups` expects these form fields:

```text
commentorName
commentorPosition
commentorPhone
commentorEmail
comment
parentId
fixedRevision
fixedFile
```

## Validation and Storage Rules

- Allowed file extensions are `.pdf`, `.png`, `.jpg`, and `.jpeg`.
- Maximum upload size is 10 MB.
- A fixed file requires a fixed revision value.
- A document is rejected when its file hash matches an existing file or its filename/revision pair already exists.
- A fixed revision is rejected when its file hash or filename/revision pair already exists.
- Files uploaded to Supabase use generated timestamp/UUID storage names.
- Local files use the same generated storage naming approach and are exposed below `/uploads/`.
- Deleting a document removes its database record; PostgreSQL cascades the linked markup records.

## Render Deployment

The included `render.yaml` defines a Node web service with:

```text
Build command: npm ci
Start command: npm start
```

Configure these Render environment variables:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET` (optional; defaults to `uploads`)

The service binds to `0.0.0.0` and uses the Render-provided `PORT` value when available.

## Troubleshooting

### Database connection errors

- Confirm `DATABASE_URL` is present and correctly formatted.
- Check that the database accepts connections from the current machine or Render service.
- For production, set `NODE_ENV=production` so PostgreSQL SSL is enabled.

### Files are not available after deployment

Local filesystem storage is not durable on many hosted platforms. Configure Supabase Storage for production deployments and verify that the bucket is public or otherwise accessible to the generated file URLs.

### Port already in use

Set another local port before starting the app:

```bash
PORT=5050 npm start
```

On PowerShell:

```powershell
$env:PORT = 5050
npm start
```

### Browser shows an old style

Reload the page without the browser cache after changing `public/styles.css`. The selected theme is also stored in `localStorage`; use the theme button to switch modes.

## Security Notes

- Never commit `.env` or expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.
- Add authentication and authorization before using the application with sensitive project documents.
- Add rate limiting, audit logging, and stricter content validation before public production use.
- Review whether public Supabase file URLs are appropriate for the documents being stored.

## Development Guidelines

- Keep frontend visual changes in `public/styles.css` where possible.
- Preserve existing API contracts when changing the UI.
- Validate both dark and light themes after UI changes.
- Do not commit local uploads, secrets, or generated dependency folders.
- Add automated API and validation tests before changing the placeholder test script.

## License

This repository does not currently include a public license. Treat it as internal or collaborative project code unless the project owner adds a license.
