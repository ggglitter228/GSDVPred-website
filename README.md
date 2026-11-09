# GSDVPred static website

This folder contains a static website for presenting GSDVPred and looking up stored results from the included ClinVar prediction table.

## What the lookup does

- Accepts variants in `chromosome:position:REF:ALT` form, the dataset form `chromosome:position-position_REF/ALT`, or an uncompressed VCF.
- Matches each query against `assets/ClinVar_data_prediction.csv` and shows the stored GSDVPred calibrated probability plus CADD, SIFT, REVEL and AlphaMissense input values.
- Allows matched and unmatched queries to be exported as a CSV.
- Does not run the trained model or annotate new variants. Queries not present in the published table have no prediction result.

The website and downloadable CSV use original, pre-imputation tool annotations joined by `u_identity` from `Scripts_Results/04.data_preprocess/data/test_data.Rdata`. All 4,552 rows matched. CADD is PHRED-scaled; SIFT, REVEL and AlphaMissense retain their original scores. Missing annotations remain empty and display as an em dash. GSDVPred calibrated probabilities are retained from the existing prediction export.

The bundled `assets/predictions.js` supports local HTML viewing without a web server. The example is `ASXL1:c.1429G>C`; gene/HGVS, transcript/HGVS, coordinate forms, and variant-list uploads are supported. `assets/Upload_variant.csv` is a downloadable input template.

## Preview locally

Open `index.html` directly, or run a static server:

```powershell
python -m http.server 8080 --directory "E:\GXY\GSD_VCF_model\Scripts_Results\07.web"
```

Then visit `http://localhost:8080`.

## Publish with GitHub Pages

The repository workflow at `.github/workflows/pages.yml` deploys this folder when changes are pushed to `main` or `master`. In repository settings, set **Pages > Build and deployment > Source** to **GitHub Actions**. After the workflow succeeds, GitHub shows the website URL in the Pages settings and the workflow run.

The repository and included prediction table must be suitable for public access before enabling a public site.
