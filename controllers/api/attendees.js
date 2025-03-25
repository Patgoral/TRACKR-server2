const Attendee = require('../../models/attendee')
const aws = require('aws-sdk')
const fs = require('fs')
const polyline = require('polyline')
const sax = require('sax')
const heicConvert = require('heic-convert')
const moment = require('moment') 
const geolib = require('geolib')


const targetCoordinates = { lat: 33.229114, lon: -83.523866 }

// Function to calculate if a point is within 500 feet
function isWithin500Feet(lat, lon) {
  const distance = geolib.getDistance(
    { latitude: lat, longitude: lon },
    targetCoordinates
  )
  return distance <= 500 // 500 feet
}

// INDEX ALL ATTENDEES
async function index(req, res) {
    try {
        const { year } = req.query;

        const filter = {};

        if (year) {
            const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
            const endOfYear = new Date(`${parseInt(year) + 1}-01-01T00:00:00.000Z`);
            filter.date = { $gte: startOfYear, $lt: endOfYear };
        }

        // Sort by date ascending (oldest first)
        const attendees = await Attendee.find(filter).sort({ date: 1 }).select('-gpx');

        res.status(200).json({ attendees });

    } catch (error) {
        res.status(400).json(error);
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

			if (req.files.image) {
				const imageFile = req.files.image[0];
				let imageBuffer = fs.readFileSync(imageFile.path);
			
				// Check if the file is HEIC
				if (imageFile.mimetype === 'image/heic' || imageFile.originalname.toLowerCase().endsWith('.heic')) {
					try {
						// Convert HEIC to JPG
						const jpgBuffer = await heicConvert({
							buffer: imageBuffer,
							format: 'JPEG',
							quality: 0.8 // Compression quality (0.0 - 1.0)
						});
			
						// Upload the converted JPG to S3
						const imageParams = {
							ACL: 'public-read',
							Bucket: process.env.AWS_BUCKET_NAME,
							Body: jpgBuffer,
							Key: `userImage/${imageFile.originalname.replace('.heic', '.jpg')}`,
							ContentType: 'image/jpeg'
						};
			
						const imageData = await s3.upload(imageParams).promise();
						
						// Clean up the local file
						fs.unlinkSync(imageFile.path);
						imageUrl = imageData.Location;
			
					} catch (error) {
						console.error('Error converting HEIC to JPG:', error);
						res.status(500).send('Error converting the file.');
					}
				} else {
					// Handle non-HEIC files as usual
					const imageParams = {
						ACL: 'public-read',
						Bucket: process.env.AWS_BUCKET_NAME,
						Body: fs.createReadStream(imageFile.path),
						Key: `userImage/${imageFile.originalname}`
					};
			
					const imageData = await s3.upload(imageParams).promise();
					fs.unlinkSync(imageFile.path);
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
					const time = node.attributes.time // Time in ISO format
					const gpxTime = moment(time).utcOffset(-5) // Convert to EST (UTC -5)
		
					// Only consider points after 2:00 PM EST
					if (gpxTime.isAfter(moment('14:00:00', 'HH:mm:ss'))) {
					  // Check if the point is within 500 feet of the target coordinates
					  if (isWithin500Feet(lat, lon)) {
						points.push([lat, lon])
						gpxTimeStamps.push(gpxTime.toISOString()) // Add valid timestamp to the array
					  }
					}
				  }
				})
		
				gpxReadStream.pipe(saxStream)
		
				await new Promise((resolve, reject) => {
				  gpxReadStream.on('end', resolve)
				  gpxReadStream.on('error', reject)
				})
		
				// If we have valid points, encode them into a polyline
				if (points.length > 0) {
				  gpxUrl = polyline.encode(points)
				}
			  }
			}
		
			// Prepare the attendee data for saving
			let attendeeData = {}
			if (req.body.attendee) {
			  attendeeData = { ...req.body.attendee }
			  if (imageUrl) {
				attendeeData.image = imageUrl
			  }
			  if (gpxUrl) {
				attendeeData.gpx = gpxUrl
			  }
			  if (gpxTimeStamps.length > 0) {
				// Add GPXTime to attendee data
				attendeeData.GPXTime = gpxTimeStamps
			  }
			} else {
			  attendeeData = {
				image: imageUrl,
				gpx: gpxUrl,
			  }
			  if (gpxTimeStamps.length > 0) {
				// Add GPXTime to attendee data
				attendeeData.GPXTime = gpxTimeStamps
			  }
			}
		
			// Save the attendee to the database
			const attendee = await Attendee.create(attendeeData)
		
			// Respond with the created attendee data
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
