# ClassPlannerV1

Plan community college classes around your work schedule and transfer goals.

Upload a DegreeWorks audit PDF, enter when you're free (multiple blocks per day + travel time),
and get the classes that finish your degree / transfer prep fastest — with double-counting classes marked.
The PDF is parsed in the browser and never uploaded.

## Run it

```
npm install
npm run dev
```

Open http://localhost:3000

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Run all tests |
| `npm run typecheck` | Check TypeScript types |
| `npm run plan -- "C:\path\to\audit.pdf" sjsu-cs` | Print a plan in the terminal |
| `npm run parse-audit -- "C:\path\to\audit.pdf"` | Print the parsed audit as JSON |

Never put a real DegreeWorks PDF inside this folder: the repo is public. `*.pdf` is git-ignored as a safety net.
