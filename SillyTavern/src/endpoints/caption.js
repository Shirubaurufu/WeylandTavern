import express from 'express';
import { getPipeline, getRawImage } from '../transformers.js';

export const router = express.Router();

const TASK = 'image-to-text';

router.post('/', async (req, res) => {
    try {
        const { image } = req.body;

        const rawImage = await getRawImage(image);

        if (!rawImage) {
            
            return res.sendStatus(400);
        }

        const pipe = await getPipeline(TASK);
        const result = await pipe(rawImage);
        const text = result[0].generated_text;
        

        return res.json({ caption: text });
    } catch (error) {
        
        return res.sendStatus(500);
    }
});
