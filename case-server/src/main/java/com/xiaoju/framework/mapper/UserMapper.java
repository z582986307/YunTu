package com.xiaoju.framework.mapper;

import com.xiaoju.framework.entity.dto.User;
import org.apache.ibatis.annotations.Param;
import java.util.List;

public interface UserMapper {
    int deleteByPrimaryKey(Long id);

    int insert(User record);

    int insertSelective(User record);

    User selectByPrimaryKey(Long id);

    User selectByUserName(String username);

    List<String> findUsernames(@Param("keyword") String keyword, @Param("limit") int limit);

    int updateByPrimaryKeySelective(User record);

    int updateByPrimaryKey(User record);
}
