const Attendee = require('../../models/attendee')
const aws = require('aws-sdk')
const fs = require('fs')
const polyline = require('polyline')
const sax = require('sax')

// INDEX ALL ATTENDEES
async function index(req, res, next) {
	try {
		Attendee.find()
			.then((attendees) => {
				return attendees
					.map((attendee) => attendee)
					.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			})
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// SHOW USER ATTENDEES
async function show(req, res, next) {
	try {
		await Attendee.find({ owner: req.user._id })
			.then((attendees) => {
				return attendees
					.map((attendee) => attendee)
					.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
			})
			.then((attendees) => {
				res.status(200).json({ attendees: attendees })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// SHOW ANY ATTENDEES
async function showAll(req, res, next) {
	try {
		await Attendee.findById(req.params.id).then((attendees) => {
			res.status(200).json({ attendees: attendees })
		})
	} catch (error) {
		res.status(400).json(error)
	}
}

// POST
async function create(req, res, next) {
	try {
		let imageUrl, gpxUrl
		if (req.files) {
			aws.config.setPromisesDependency()
			aws.config.update({
				accessKeyId: process.env.AWS_ACCESS_KEY,
				secretAccessKey: process.env.AWS_SECRET_KEY,
				region: process.env.AWS_BUCKET_REGION,
			})
			const s3 = new aws.S3()

			const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
}

if (req.files.image) {
    const imageFile = req.files.image[0];
    const inputPath = imageFile.path;
    const outputPath = path.join(tmpDir, `${imageFile.originalname}.jpg`); // Output path for JPG

    // Check if the uploaded file is HEIC
    if (imageFile.mimetype === 'image/heic' || imageFile.originalname.toLowerCase().endsWith('.heic')) {
        try {
            // Convert HEIC to JPG using heic2any
            const outputBuffer = await heic2any({
                buffer: fs.readFileSync(inputPath),  // Read the HEIC file into a buffer
                type: 'image/jpeg',  // Convert to JPG
            });

            // Write the converted buffer to the output path
            fs.writeFileSync(outputPath, outputBuffer);

            // Prepare the file for upload to S3
            const imageParams = {
                ACL: 'public-read',
                Bucket: process.env.AWS_BUCKET_NAME,
                Body: fs.createReadStream(outputPath),
                Key: `userImage/${imageFile.originalname.replace('.heic', '.jpg')}`, // Ensure the file name is .jpg
            };

            // Upload the converted image to S3
            const imageData = await s3.upload(imageParams).promise();

            // Clean up the local files
            fs.unlinkSync(inputPath); // Remove original HEIC file
            fs.unlinkSync(outputPath); // Remove the converted JPG file

            imageUrl = imageData.Location;
        } catch (error) {
            console.error('Error during HEIC to JPG conversion:', error);
            res.status(500).send('Error converting the file.');
        }
    } else {
        // If it's not a HEIC file, upload it as is
        const imageParams = {
            ACL: 'public-read',
            Bucket: process.env.AWS_BUCKET_NAME,
            Body: fs.createReadStream(inputPath),
            Key: `userImage/${imageFile.originalname}`,
        };

        const imageData = await s3.upload(imageParams).promise();
        fs.unlinkSync(inputPath); // Clean up the local file
        imageUrl = imageData.Location;
    }
}

			if (req.files.gpx) {
				const gpxReadStream = fs.createReadStream(req.files.gpx[0].path, 'utf8')
				const saxStream = sax.createStream(true)

				let points = []
				saxStream.on('opentag', (node) => {
					if (node.name === 'trkpt') {
						const lat = parseFloat(node.attributes.lat)
						const lon = parseFloat(node.attributes.lon)
						points.push([lat, lon])
					}
				})

				gpxReadStream.pipe(saxStream)

				await new Promise((resolve, reject) => {
					gpxReadStream.on('end', resolve)
					gpxReadStream.on('error', reject)
				})

				gpxUrl = polyline.encode(points)
			}
		}

		let attendeeData = {}
		if (req.body.attendee) {
			attendeeData = { ...req.body.attendee }
			if (imageUrl) {
				attendeeData.image = imageUrl
			}
			if (gpxUrl) {
				attendeeData.gpx = gpxUrl
			}
		} else {
			attendeeData = {
				image: imageUrl,
				gpx: gpxUrl,
			}
		}

		const attendee = await Attendee.create(attendeeData)

		res.status(201).json({ attendee })
	} catch (error) {
		console.log('Error occurred while trying to upload to S3 bucket', error)
		res.status(400).json(error)
	}
}

// PATCH
async function patch(req, res, next) {
	try {
		const attendee = req.body.attendee
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.updateOne(req.body.attendee)
			})
			.then((attendee) => {
				res.status(202).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

// DELETE
async function remove(req, res, next) {
	try {
		await Attendee.findById(req.params.id)
			.then((attendee) => {
				return attendee.deleteOne()
			})
			.then((attendee) => {
				res.status(204).json({ attendee: attendee })
			})
	} catch (error) {
		res.status(400).json(error)
	}
}

module.exports = {
	index,
	show,
	create,
	patch,
	remove,
	showAll,
}
