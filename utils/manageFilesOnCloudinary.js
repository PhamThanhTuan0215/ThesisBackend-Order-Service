const cloudinary = require('../configs/CloudinaryConfig');

async function uploadFiles(files, folderPathUpload) {
  try {
    // Tạo một mảng các promises để upload từng file
    const uploadPromises = files.map(file => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
          folder: folderPathUpload, // Thư mục nơi ảnh sẽ được lưu trên Cloudinary
          resource_type: 'image', // Loại tài nguyên là hình ảnh
        }, (error, result) => {
          if (error) {
            reject(error); // Nếu có lỗi thì reject promise
          }
          resolve(result); // Nếu thành công thì resolve promise với kết quả
        });

        uploadStream.end(file.buffer); // Dữ liệu của file sẽ được upload
      });
    });

    // Chờ tất cả các promises hoàn thành
    const results = await Promise.all(uploadPromises);
    return results; // Trả về mảng kết quả của tất cả các upload
  } catch (error) {
    console.error('Error uploading images:', error);
    throw error; // Nếu có lỗi thì ném lỗi ra ngoài
  }
}

async function deleteFile(public_id) {
  cloudinary.uploader.destroy(public_id)
}

module.exports = {uploadFiles, deleteFile};
