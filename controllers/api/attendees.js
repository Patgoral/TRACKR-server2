const Attendee = require('../../models/attendee')
const aws = require('aws-sdk')
const fs = require('fs')
const polyline = require('polyline')
const sax = require('sax')
const sharp = require('sharp') 
const path = require('path')

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

			// Handle image file (check for HEIC and convert if needed)
			if (req.files.image) {
				const imagePath = req.files.image[0].path
				const originalName = req.files.image[0].originalname
				const fileExtension = path.extname(originalName).toLowerCase() // Get the file extension
				const newFilePath = `temp_${originalName}.jpg` // Temporary name for the converted file

				// Check if the image is HEIC
				if (fileExtension === '.heic') {
					// Convert HEIC to JPEG using sharp
						 sharp(imagePath)
						.toFormat('jpeg')
						.toFile(newFilePath, async (err, info) => {
							if (err) {is 
								console.error('Error during conversion', err)
								return
							}

							// Upload the converted image to S3
							const imageParams = {
								ACL: 'public-read',
								Bucket: process.env.AWS_BUCKET_NAME,
								Body: fs.createReadStream(newFilePath), // Upload the converted file
								Key: `userImage/${newFilePath}`, // S3 key
							}
							const imageData = await s3.upload(imageParams).promise()

							// Clean up: delete the local converted file
							fs.unlinkSync(imagePath)
							fs.unlinkSync(newFilePath)

							imageUrl = imageData.Location
						})
				} else {
					// If it's not a HEIC, upload the original file to S3
					const imageParams = {
						ACL: 'public-read',
						Bucket: process.env.AWS_BUCKET_NAME,
						Body: fs.createReadStream(imagePath),
						Key: `userImage/${originalName}`,
					}
					const imageData = await s3.upload(imageParams).promise()

					// Clean up: delete the local original file
					fs.unlinkSync(imagePath)

					imageUrl = imageData.Location
				}
			}

			// Handle GPX file
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

		// Prepare attendee data to save in the database
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

		// Create a new attendee
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
